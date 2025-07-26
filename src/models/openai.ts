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
): Promise<ArrayBuffer> {
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
        ...(options.instructions && {
          instructions: options.instructions,
        }),
        input: text,
        speed: 1.0,
      }),
    },
  );
  await validate200OpenAI(headers);
  const bf = await headers.arrayBuffer();
  return bf;
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
