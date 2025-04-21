import {
  REAL_HUME_API_URL,
  REAL_OPENAI_API_URL,
  TTSPluginSettings,
} from "./TTSPluginSettings";

/**
 * options used by the audio model. Some options are used as a cache key, such that changes to the options
 * will cause audio to reload
 */
export interface TTSModelOptions {
  model: string;
  voice?: string;
  sourceType: string;
  instructions?: string;
  apiUri: string;
  apiKey: string;
}

export class TTSErrorInfo extends Error {
  status: string;
  httpErrorCode?: number;
  errorDetails: unknown;
  constructor(
    status: string,
    responseDetails: unknown,
    httpErrorCode?: number,
  ) {
    super(`Request failed due to '${httpErrorCode || status}'`);
    this.name = "TTSErrorInfo";
    this.message = `Request failed '${status}'`;
    this.httpErrorCode = httpErrorCode;
    this.status = status;
    this.errorDetails = responseDetails;
  }

  get isRetryable(): boolean {
    if (this.httpErrorCode === undefined) {
      return true;
    }
    return this.httpErrorCode === 429 || this.httpErrorCode >= 500;
  }

  ttsJsonMessage(): string | undefined {
    return (this.errorDetails as ErrorMessage)?.error?.message;
  }
  ttsErrorCode(): string | undefined {
    return (this.errorDetails as ErrorMessage)?.error?.code;
  }
}

export function toModelOptions(
  pluginSettings: TTSPluginSettings,
): TTSModelOptions {
  return {
    model: pluginSettings.model,
    voice: pluginSettings.ttsVoice || undefined,
    instructions: pluginSettings.instructions || undefined,
    sourceType: pluginSettings.sourceType,
    apiUri: pluginSettings.API_URL || (pluginSettings.modelProvider === 'hume' ? REAL_HUME_API_URL : REAL_OPENAI_API_URL),
    apiKey: pluginSettings.API_KEY,
  };
}

export interface TTSModel {
  (text: string, options: TTSModelOptions): Promise<ArrayBuffer>;
}
export const humeTextToSpeech: TTSModel = async function humeTextToSpeech(
  text: string,
  options: TTSModelOptions,
): Promise<ArrayBuffer> {
  const headers = await fetch(orDefaultHume(options.apiUri) + "/v0/tts", {
    headers: {
      "X-Hume-Api-Key": options.apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      utterances: [
        {
          ...(options.voice && {
            voice: {
              id: options.voice,
              provider: options.sourceType,
            },
          }),
          ...(options.instructions && {
            description: options.instructions,
          }),
          text: text,
          speed: 1,
        },
      ],
      format: { type: "mp3" },
      num_generations: 1,
      split_utterances: false,
    }),
  });
  await validate200(headers);
  const res = await headers.json();
  const audioBase64: string = res.generations[0].audio;
  const audioData = Uint8Array.from(
    atob(audioBase64),
    (c) => c.charCodeAt(0),
  );
  return audioData.buffer;
};

export const openAITextToSpeech: TTSModel = async function openAITextToSpeech(
  text: string,
  options: TTSModelOptions,
): Promise<ArrayBuffer> {
  const headers = await fetch(orDefaultOpenAI(options.apiUri) + "/v1/audio/speech", {
    headers: {
      Authorization: "Bearer " + options.apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: options.model,
      voice: (options.voice ? options.voice : ""),
      ...(options.instructions && {
        instructions: options.instructions
      }),
      input: text,
      speed: 1,
    }),
  });
  await validate200(headers);
  const bf = await headers.arrayBuffer();
  return bf;
};

function orDefaultOpenAI(maybeUrl: string): string {
  return maybeUrl.replace(/\/$/, "") || REAL_OPENAI_API_URL;
}

function orDefaultHume(maybeUrl: string): string {
  return maybeUrl.replace(/\/$/, "") || REAL_HUME_API_URL;
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
  await validate200(headers);
  const models = await headers.json();
  return models.data as string[];
}

async function validate200(response: Response) {
  if (response.status >= 300) {
    let body;
    try {
      body = await response.json();
    } catch (ex) {
      // nothing
    }
    throw new TTSErrorInfo(
      `HTTP ${response.status} error`,
      body,
      response.status,
    );
  }
}

export class APIError extends Error {
  name = "APIError";
  status: number;
  json?: unknown;

  constructor(status: number, json?: unknown) {
    super(`API error (${status}) - ${JSON.stringify(json)})`);
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
