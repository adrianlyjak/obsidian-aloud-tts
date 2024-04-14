import { type RequestUrlResponse, requestUrl } from "obsidian";
import { TTSPluginSettings } from "./TTSPluginSettings";

/**
 * options used by the audio model. Some options are used as a cache key, such that changes to the options
 * will cause audio to reload
 */
export interface TTSModelOptions {
  model: string;
  voice: string;
  apiUri: string;
  apiKey: string;
  playbackSpeed: number;
}

export function toModelOptions(
  pluginSettings: TTSPluginSettings,
): TTSModelOptions {
  return {
    model: pluginSettings.model,
    voice: pluginSettings.ttsVoice,
    apiUri: pluginSettings.OPENAI_API_URL,
    apiKey: pluginSettings.OPENAI_API_KEY,
    playbackSpeed: pluginSettings.playbackSpeed,
  };
}

export interface TTSModel {
  (text: string, options: TTSModelOptions): Promise<ArrayBuffer>;
}

export const openAITextToSpeech: TTSModel = async function openAITextToSpeech(
  text: string,
  options: TTSModelOptions,
): Promise<ArrayBuffer> {
  const headers = await requestUrl({
    url: options.apiUri + "/v1/audio/speech",
    headers: {
      Authorization: "Bearer " + options.apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: options.model,
      voice: options.voice,
      input: text,
      speed: options.playbackSpeed,
    }),
  });
  await validate200(headers);
  const bf = headers.arrayBuffer;
  return bf;
};

export async function listModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  const headers = await requestUrl({
    url: settings.OPENAI_API_URL + "/v1/models",
    method: "GET",
    headers: {
      Authorization: "Bearer " + settings.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
  });
  await validate200(headers);
  const models = await headers.json;
  return models.data as string[];
}

async function validate200(response: RequestUrlResponse) {
  if (response.status !== 200) {
    let body;
    try {
      body = await response.json();
    } catch (ex) {
      // nothing
    }
    throw new OpenAIAPIError(response.status, body);
  }
}

export class OpenAIAPIError extends Error {
  name = "OpenAIAPIError";
  status: number;
  json?: unknown;
  constructor(status: number, json?: unknown) {
    super(`OpenAI API error (${status}) - ${JSON.stringify(json)})`);
    this.status = status;
    this.json = json;
  }
  jsonMessage(): string | undefined {
    return (this.json as ErrorMessage)?.error?.message;
  }
  errorCode(): string | undefined {
    return (this.json as ErrorMessage)?.error?.code;
  }
}

// {
//   "error": {
//     "message": "Incorrect API key provided: sk-DnweH**************************************qMr3. You can find your API key at https://platform.openai.com/account/api-keys.",
//     "type": "invalid_request_error",
//     "param": null,
//     "code": "invalid_api_key"
//   }
// }

type ErrorMessage = {
  error: {
    message: string;
    type: string;
    code: string;
    param: unknown;
  };
};
