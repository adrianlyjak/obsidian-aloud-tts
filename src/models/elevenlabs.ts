import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";

export const ELEVENLABS_API_URL = "https://api.elevenlabs.io";

export const elevenLabsTextToSpeech: TTSModel = {
  call: elevenLabsCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.elevenlabs_apiKey) {
      return REQUIRE_API_KEY;
    }
    return await validateApiKeyElevenLabs(settings.elevenlabs_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.elevenlabs_apiKey,
      voice: settings.elevenlabs_voice,
      model: settings.elevenlabs_model,
    };
  },
};

export async function validateApiKeyElevenLabs(
  apiKey: string,
): Promise<string | undefined> {
  try {
    await listElevenLabsVoices(apiKey);
    return undefined;
  } catch (error) {
    if (error instanceof TTSErrorInfo) {
      if (error.httpErrorCode === 401) {
        return "Invalid API key";
      } else if (error.httpErrorCode !== undefined) {
        return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
      } else {
        return error.ttsJsonMessage() || error.message;
      }
    }
    return "Cannot connect to ElevenLabs API";
  }
}

export async function elevenLabsCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
): Promise<ArrayBuffer> {
  if (!options.voice) {
    throw new TTSErrorInfo("Voice is required for ElevenLabs TTS", {
      error: {
        message: "Voice is required for ElevenLabs TTS",
        type: "invalid_request_error",
        code: "missing_voice",
        param: null,
      },
    });
  }

  const requestBody: {
    text: string;
    model_id: string;
    voice_settings?: {
      stability?: number;
      similarity_boost?: number;
    };
    previous_text?: string;
    next_text?: string;
  } = {
    text: text,
    model_id: options.model,
  };

  // Add voice settings if available in settings
  const stability = settings.elevenlabs_stability;
  const similarity = settings.elevenlabs_similarity;
  if (stability !== undefined || similarity !== undefined) {
    requestBody.voice_settings = {};
    if (stability !== undefined) {
      requestBody.voice_settings.stability = stability;
    }
    if (similarity !== undefined) {
      requestBody.voice_settings.similarity_boost = similarity;
    }
  }

  // Add context if available (ElevenLabs supports context)
  if (context.textBefore) {
    requestBody.previous_text = context.textBefore;
  }
  if (context.textAfter) {
    requestBody.next_text = context.textAfter;
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/v1/text-to-speech/${options.voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": options.apiKey || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );

  await validate200ElevenLabs(response);
  return await response.arrayBuffer();
}

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category: string;
  // and a crap ton of other fields
};

export async function listElevenLabsVoices(
  apiKey: string,
  voice_type?:
    | "personal"
    | "community"
    | "workspace"
    | "default"
    | "non-default",
): Promise<ElevenLabsVoice[]> {
  const params = new URLSearchParams();
  if (voice_type) {
    params.set("voice_type", voice_type);
  }
  const response = await fetch(
    `${ELEVENLABS_API_URL}/v2/voices` +
      (params.toString() ? `?${params.toString()}` : ""),
    {
      headers: {
        "xi-api-key": apiKey,
      },
    },
  );

  await validate200ElevenLabs(response);
  const data = await response.json();

  return data.voices.map((voice: any) => ({
    ...voice,
    voice_id: voice.voice_id,
    name: voice.name,
    category: voice.category || "default",
  }));
}

export async function listElevenLabsModels(
  apiKey: string,
): Promise<{ id: string; name: string }[]> {
  const response = await fetch(`${ELEVENLABS_API_URL}/v1/models`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  await validate200ElevenLabs(response);
  const data = await response.json();

  return data.map((model: any) => ({
    id: model.model_id,
    name: model.name,
  }));
}

async function validate200ElevenLabs(response: Response) {
  if (response.status >= 300) {
    let errorMessage: ErrorMessage | undefined;
    try {
      const jsonBody = await response.json();
      if (jsonBody.detail) {
        errorMessage = {
          error: {
            message:
              jsonBody.detail.message || jsonBody.detail || "Unknown error",
            type: "elevenlabs_error",
            code: response.status.toString(),
            param: null,
          },
        };
      }
    } catch (ex) {
      // Failed to parse JSON, use generic error
    }

    throw new TTSErrorInfo(
      `HTTP ${response.status} error`,
      errorMessage,
      response.status,
    );
  }
}
