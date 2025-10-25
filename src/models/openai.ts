import { TTSPluginSettings } from "../player/TTSPluginSettings";
import { AudioData } from "./tts-model";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
  validate200,
} from "./tts-model";

export const OPENAI_API_URL = "https://api.openai.com";
// OpenAI / Compatible API implementation
export const openAITextToSpeech: TTSModel = {
  call: openAICallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.openai_apiKey) {
      return REQUIRE_API_KEY;
    }

    try {
      await listOpenAIModels(settings);
    } catch (ex) {
      console.error("Could not validate API key", ex);
      let message = "Cannot connect to OpenAI";
      if (ex instanceof TTSErrorInfo) {
        if (ex.ttsErrorCode() === "invalid_api_key") {
          message =
            "Invalid API key! Enter a valid API key in the plugin settings";
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
      apiKey: settings.openai_apiKey,
      apiUri: OPENAI_API_URL,
      voice: settings.openai_ttsVoice,
      instructions: settings.openai_ttsInstructions,
      model: settings.openai_ttsModel,
    };
  },
};

export async function openAICallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
): Promise<AudioData> {
  const canInstruct = supportsInstructions(options.model);
  let instructions = options.instructions;
  if (canInstruct && context.textBefore) {
    instructions = instructions ? instructions + "\n\n" : "";
    instructions +=
      "Maintain tone and pacing with the following speech before and after this text:\n\n";
    instructions +=
      "<previous_context>\n" + context.textBefore + "\n</previous_context>\n";
  }

  const headers = await fetch(
    (options.apiUri || OPENAI_API_URL) + "/v1/audio/speech",
    {
      headers: {
        Authorization: "Bearer " + options.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        voice: options.voice ? options.voice : "",
        ...(instructions ? { instructions } : {}),
        input: text,
        speed: 1.0,
      }),
    },
  );
  await validate200OpenAI(headers);
  const bf = await headers.arrayBuffer();
  return { data: bf, format: "mp3" };
}

export async function listOpenAIModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  const headers = await fetch(OPENAI_API_URL + "/v1/models", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + settings.openai_apiKey,
      "Content-Type": "application/json",
    },
  });
  await validate200OpenAI(headers);
  const models = await headers.json();
  return models.data as string[];
}

export async function validate200OpenAI(response: Response) {
  const getErrorMessage = (body: unknown) => {
    return body as ErrorMessage;
  };
  await validate200(response, getErrorMessage);
}

export interface OpenAIModel {
  label: string;
  value: string;
  supportsInstructions?: boolean;
}

export function supportsInstructions(model: string): boolean {
  return (
    DEFAULT_OPENAI_MODELS.find((x) => x.value === model)
      ?.supportsInstructions || false
  );
}

export const DEFAULT_OPENAI_MODELS: OpenAIModel[] = [
  {
    label: "gpt-4o-mini-tts",
    value: "gpt-4o-mini-tts",
    supportsInstructions: true,
  },
  { label: "tts-1", value: "tts-1" },
  { label: "tts-1-hd", value: "tts-1-hd" },
] as const;
