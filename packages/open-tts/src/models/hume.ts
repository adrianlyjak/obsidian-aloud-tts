import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type TTSModel,
  type TTSModelOptions,
} from "./tts-model";
import { validate200 } from "./tts-model";
import { base64ToArrayBuffer } from "../util/misc";
import type { AudioData } from "./tts-model";
import type { TTSPluginSettings } from "../player/TTSPluginSettings";

export const HUME_API_URL = "https://api.hume.ai";

export const humeTextToSpeech: TTSModel = {
  call: humeCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.hume_apiKey) {
      return REQUIRE_API_KEY;
    }
    return await validateApiKeyHume(settings.hume_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.hume_apiKey,
      model: settings.hume_sourceType,
      voice: settings.hume_ttsVoice,
      instructions: settings.hume_ttsInstructions,
    };
  },
};

export async function humeCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  // Construct the utterances array for the Hume API request
  const utterance: {
    text: string;
    voice?: { id: string; provider: string };
    description?: string;
    speed?: number;
  } = {
    text: text,
    voice: options.voice
      ? {
          id: options.voice,
          /** overloads the sourceType into the model field */
          provider: options.model.toUpperCase(),
        }
      : undefined,
    description: options.instructions,
    speed: 1.0,
  };

  let contextUtterances: { text: string }[] | undefined;
  if (context.textBefore) {
    contextUtterances = [
      {
        text: context.textBefore,
      },
    ];
  }

  const headers = await fetch(`${HUME_API_URL}/v0/tts`, {
    headers: {
      "X-Hume-Api-Key": options.apiKey || "",
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      ...(contextUtterances && {
        context: { utterances: contextUtterances },
      }),
      utterances: [utterance],
      format: { type: "mp3" },
      num_generations: 1,
      split_utterances: true,
    }),
    signal,
  });
  await validate200Hume(headers);
  const res = await headers.json();

  // Hume might return multiple generations, we only care about the first one.
  const generation = res.generations[0];
  if (!generation) {
    console.error("Hume response missing generations:", res);
    throw new Error("Hume response missing generations");
  }

  return { data: base64ToArrayBuffer(generation.audio), format: "mp3" };
}

async function validateApiKeyHume(apiKey: string): Promise<string | undefined> {
  try {
    await listModels("HUME_AI", apiKey, 1);
    return undefined;
  } catch (error) {
    if (error instanceof TTSErrorInfo) {
      if (error.httpErrorCode === 401) {
        return "Invalid API key";
      }
      return error.message;
    }
    return "Unknown error";
  }
}

export async function listModels(
  provider: "HUME_AI" | "CUSTOM_VOICE",
  apiKey: string,
  pageSize: number = 100,
): Promise<{ id: string; name: string }[]> {
  const headers = await fetch(
    `${HUME_API_URL}/v0/tts/voices?provider=${provider}&page_size=${pageSize}`,
    {
      headers: {
        "X-Hume-Api-Key": apiKey,
      },
    },
  );
  await validate200Hume(headers);
  const res = await headers.json();
  return res.voices_page.map((voice: { id: string; name: string }) => ({
    id: voice.id,
    name: voice.name,
  }));
}

const validate200Hume = async (response: Response) => {
  await validate200(response, mapHumeError);
};

const mapHumeError = (body: unknown): ErrorMessage | undefined => {
  try {
    if (!isRecord(body)) return undefined;

    // Handle fault-based error format
    const fault = isRecord(body.fault) ? body.fault : null;
    if (fault) {
      return {
        error: {
          message:
            typeof fault.faultstring === "string"
              ? fault.faultstring
              : "Unknown error",
          type: "fault",
          code:
            isRecord(fault.detail) && typeof fault.detail.errorcode === "string"
              ? fault.detail.errorcode
              : "unknown",
          param: null,
        },
      };
    }

    // Handle standard error format
    if (body.status || body.error || body.message) {
      return {
        error: {
          message:
            typeof body.message === "string" ? body.message : "Unknown error",
          type: typeof body.error === "string" ? body.error : "unknown",
          code: body.status != null ? String(body.status) : "unknown",
          param: typeof body.path === "string" ? body.path : null,
        },
      };
    }

    return undefined;
  } catch (parseError) {
    console.warn("Failed to parse Hume error JSON:", parseError);
    return undefined;
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
