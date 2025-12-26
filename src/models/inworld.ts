import { base64ToArrayBuffer } from "../util/misc";
import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
  validate200,
} from "./tts-model";
import { AudioData } from "./tts-model";

const INWORLD_API_URL = "https://api.inworld.ai";

export const inworldTextToSpeech: TTSModel = {
  call: inworldCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.inworld_apiKey) {
      return REQUIRE_API_KEY;
    }

    try {
      await listInworldVoices(settings);
    } catch (ex) {
      console.error("Could not validate Inworld API key", ex);
      let message = "Cannot connect to Inworld";
      if (ex instanceof TTSErrorInfo) {
        if (ex.httpErrorCode === 401 || ex.httpErrorCode === 403) {
          message = "Invalid API key! Please check your Inworld credentials.";
        } else {
          const msg = ex.ttsJsonMessage();
          if (msg) {
            message = msg;
          }
        }
      }
      return message;
    }
    return undefined;
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.inworld_apiKey,
      model: settings.inworld_modelId,
      voice: settings.inworld_voiceId,
    };
  },
};

export async function inworldCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
): Promise<AudioData> {
  const response = await fetch(`${INWORLD_API_URL}/tts/v1/voice`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voiceId: options.voice,
      modelId: options.model,
      audioConfig: {
        audioEncoding: "MP3",
      },
    }),
  });

  await validate200Inworld(response);
  const json = await response.json();

  // The response contains audioContent as a base64 string
  if (!json.audioContent) {
    throw new Error("No audio content received from Inworld API");
  }

  // Convert base64 to ArrayBuffer
  return {
    data: base64ToArrayBuffer(json.audioContent),
    format: "mp3",
  };
}

export interface InworldVoice {
  voiceId: string;
  displayName: string;
  description?: string;
  tags?: string[];
  languages?: string[];
}

export async function listInworldVoices(
  settings: TTSPluginSettings,
): Promise<InworldVoice[]> {
  // If no API key is set, return empty list to avoid 401
  if (!settings.inworld_apiKey) {
    return [];
  }

  const response = await fetch(`${INWORLD_API_URL}/tts/v1/voices`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${settings.inworld_apiKey}`,
      "Content-Type": "application/json",
    },
  });

  await validate200Inworld(response);
  const data = await response.json();
  return data.voices || [];
}

export async function validate200Inworld(response: Response) {
  const getErrorMessage = (body: unknown) => {
    // Inworld error format: { code: number, message: string, details: [] }
    const err = body as any;
    return {
      error: {
        message: err?.message || "Unknown error",
        type: "inworld_error",
        code: String(err?.code || response.status),
      },
    } as ErrorMessage;
  };
  await validate200(response, getErrorMessage);
}

export const DEFAULT_INWORLD_MODELS = [
  { label: "Standard", value: "inworld-tts-1" },
  { label: "Max Quality", value: "inworld-tts-1-max" },
] as const;
