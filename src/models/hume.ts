import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";
import { validate200 } from "./tts-model";
import { base64ToArrayBuffer } from "../util/misc";
import { TTSPluginSettings } from "../player/TTSPluginSettings";

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
): Promise<ArrayBuffer> {
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
  });
  await validate200Hume(headers);
  const res = await headers.json();

  // Hume might return multiple generations, we only care about the first one.
  const generation = res.generations[0];
  if (!generation) {
    console.error("Hume response missing generations:", res);
    throw new Error("Hume response missing generations");
  }

  return base64ToArrayBuffer(generation.audio);
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
    const response = body as any;

    // Handle fault-based error format
    if (response.fault) {
      return {
        error: {
          message: response.fault.faultstring || "Unknown error",
          type: "fault",
          code: response.fault.detail?.errorcode || "unknown",
          param: null,
        },
      };
    }

    // Handle standard error format
    if (response.status || response.error || response.message) {
      return {
        error: {
          message: response.message || "Unknown error",
          type: response.error || "unknown",
          code: String(response.status || "unknown"),
          param: response.path || null,
        },
      };
    }

    return undefined;
  } catch (parseError) {
    console.warn("Failed to parse Hume error JSON:", parseError);
    return undefined;
  }
};
