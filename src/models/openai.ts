import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  ErrorMessage,
  requireApiKey,
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
    const error = requireApiKey(settings);
    if (error) {
      return error;
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
  applyModelSpecificSettings: (settings) => {
    return {
      API_KEY: settings.openai_apiKey,
      API_URL: OPENAI_API_URL,
      ttsVoice: settings.openai_ttsVoice,
      instructions: settings.openai_ttsInstructions || undefined,
      model: settings.openai_ttsModel,
      contextMode: false,
    };
  },
};

export async function openAICallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  contexts?: string[],
): Promise<ArrayBuffer> {
  const headers = await fetch(
    orDefaultOpenAI(options.apiUri) + "/v1/audio/speech",
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
          instructions:
            options.instructions +
            (contexts &&
              options.contextMode &&
              "\n\n Previous sentence(s) (Context): " + contexts.join("")),
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

function orDefaultOpenAI(maybeUrl: string): string {
  return maybeUrl.replace(/\/$/, "") || OPENAI_API_URL;
}

export async function listOpenAIModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  const headers = await fetch(
    orDefaultOpenAI(settings.API_URL) + "/v1/models",
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + settings.API_KEY,
        "Content-Type": "application/json",
      },
    },
  );
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
