import { TTSPluginSettings } from "./TTSPluginSettings";

export async function openAITextToSpeech(
  settings: TTSPluginSettings,
  text: string
): Promise<ArrayBuffer> {
  const headers = await fetch(settings.OPENAI_API_URL + "/v1/audio/speech", {
    headers: {
      Authorization: "Bearer " + settings.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: settings.model,
      voice: settings.ttsVoice,
      input: text,
    }),
  });
  await validate200(headers);
  const bf = await headers.arrayBuffer();
  return bf;
}

export async function listModels(
  settings: TTSPluginSettings
): Promise<string[]> {
  const headers = await fetch(settings.OPENAI_API_URL + "/v1/models", {
    headers: {
      Authorization: "Bearer " + settings.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    method: "GET",
  });
  await validate200(headers);
  const models = await headers.json();
  return models.data as string[];
}

async function validate200(response: Response) {
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
