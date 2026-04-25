import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";
import { AudioData } from "./tts-model";

export const FISH_API_URL = "https://api.fish.audio";

export interface FishVoice {
  id: string;
  title: string;
  visibility: "public" | "unlist" | "private";
  state: "created" | "training" | "trained" | "failed";
  type: "svc" | "tts";
}

export const fishTextToSpeech: TTSModel = {
  call: fishCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.fish_apiKey) {
      return REQUIRE_API_KEY;
    }
    return await validateApiKeyFish(settings.fish_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.fish_apiKey,
      model: settings.fish_model,
      voice: settings.fish_voiceId,
    };
  },
};

export async function validateApiKeyFish(
  apiKey: string,
): Promise<string | undefined> {
  try {
    await listFishVoices(apiKey, true);
    return undefined;
  } catch (error) {
    if (error instanceof TTSErrorInfo) {
      if (error.httpErrorCode === 401 || error.httpErrorCode === 403) {
        return "Invalid API key";
      } else if (error.httpErrorCode !== undefined) {
        return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
      } else {
        return error.ttsJsonMessage() || error.message;
      }
    }
    return "Cannot connect to Fish Audio API";
  }
}

export async function fishCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  _settings: TTSPluginSettings,
  _context: AudioTextContext = {},
): Promise<AudioData> {
  if (!options.voice) {
    throw new TTSErrorInfo("Voice model ID is required for Fish Audio TTS", {
      error: {
        message: "Voice model ID is required for Fish Audio TTS",
        type: "invalid_request_error",
        code: "missing_voice",
        param: null,
      },
    });
  }

  const response = await fetch(`${FISH_API_URL}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey || ""}`,
      "Content-Type": "application/json",
      model: options.model,
    },
    body: JSON.stringify({
      text,
      reference_id: options.voice,
      format: "mp3",
      mp3_bitrate: 128,
      normalize: true,
    }),
  });

  await validate200Fish(response);
  return {
    data: await response.arrayBuffer(),
    format: "mp3",
  };
}

export async function listFishVoices(
  apiKey: string,
  self: boolean,
): Promise<FishVoice[]> {
  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    page_size: "50",
    page_number: "1",
    sort_by: "created_at",
  });
  if (self) {
    params.set("self", "true");
  }

  const response = await fetch(`${FISH_API_URL}/model?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  await validate200Fish(response);
  const data = await response.json();
  return parseFishVoiceList(data);
}

export async function getFishVoice(
  apiKey: string,
  voiceId: string,
): Promise<FishVoice> {
  const response = await fetch(
    `${FISH_API_URL}/model/${encodeURIComponent(voiceId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  await validate200Fish(response);
  return parseFishVoice(await response.json());
}

export async function validate200Fish(response: Response): Promise<void> {
  if (response.status < 300) {
    return;
  }

  let errorMessage: ErrorMessage | undefined;
  try {
    errorMessage = fishErrorMessage(await response.json(), response.status);
  } catch {
    errorMessage = undefined;
  }

  throw new TTSErrorInfo(
    `HTTP ${response.status} error`,
    errorMessage,
    response.status,
  );
}

function fishErrorMessage(body: unknown, status: number): ErrorMessage {
  const bodyRecord = isRecord(body) ? body : {};
  const message = readString(bodyRecord, "message") ?? "Unknown error";
  const statusCode =
    readNumber(bodyRecord, "status")?.toString() ?? status.toString();

  return {
    error: {
      message,
      type: "fish_audio_error",
      code: statusCode,
      param: null,
    },
  };
}

function parseFishVoiceList(data: unknown): FishVoice[] {
  if (!isRecord(data) || !Array.isArray(data.items)) {
    return [];
  }
  return data.items.map(parseFishVoice);
}

function parseFishVoice(data: unknown): FishVoice {
  const record = isRecord(data) ? data : {};
  return {
    id: readString(record, "_id") ?? "",
    title: readString(record, "title") ?? "Untitled voice",
    visibility: parseVisibility(readString(record, "visibility")),
    state: parseState(readString(record, "state")),
    type: parseType(readString(record, "type")),
  };
}

function parseVisibility(value: string | undefined): FishVoice["visibility"] {
  if (value === "private" || value === "unlist" || value === "public") {
    return value;
  }
  return "public";
}

function parseState(value: string | undefined): FishVoice["state"] {
  if (
    value === "created" ||
    value === "training" ||
    value === "trained" ||
    value === "failed"
  ) {
    return value;
  }
  return "created";
}

function parseType(value: string | undefined): FishVoice["type"] {
  if (value === "tts" || value === "svc") {
    return value;
  }
  return "tts";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}
