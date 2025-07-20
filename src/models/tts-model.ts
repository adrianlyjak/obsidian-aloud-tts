import {
  MARKETING_NAME_LONG,
  TTSPluginSettings,
} from "../player/TTSPluginSettings";

export class TTSErrorInfo extends Error {
  status: string;
  httpErrorCode?: number;
  errorDetails?: ErrorMessage;
  constructor(
    status: string,
    // optionally include an error message in openai error format
    responseDetails?: ErrorMessage,
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
    return this.errorDetails?.error?.message;
  }
  ttsErrorCode(): string | undefined {
    return this.errorDetails?.error?.code;
  }
}

/**
 * options used by the audio model. Some options are used as a cache key, such that changes to the options
 * will cause audio to reload
 */
export interface TTSModelOptions {
  model: string;
  voice?: string;
  sourceType: string;
  instructions?: string;
  contextMode: boolean;
  apiUri: string;
  apiKey: string;
}

// Interface for batch text-to-speech requests
export interface TTSModel {
  /** Calls text to speech, returning an mp3 buffer of the audio (TODO! support other formats) */
  call(
    text: string,
    options: TTSModelOptions,
    contexts?: string[],
  ): Promise<ArrayBuffer>;

  /** Returns an error message if the connection is not valid, otherwise undefined */
  validateConnection(settings: TTSPluginSettings): Promise<string | undefined>;

  /**
   * Utility that reads the model provider specific settings (e.g. prefixed fields), and returns a record
   * of shared settings to apply, when this provider is selected. E.g. read openai_apiKey and openai_apiUrl,
   * and return { API_KEY: openai_apiKey, API_URL: openai_apiUrl } */
  convertToOptions(settings: TTSPluginSettings): TTSModelOptions;
}

export async function validate200(
  response: Response,
  getErrorMessage: (body: unknown) => ErrorMessage | undefined = (body) =>
    undefined,
) {
  if (response.status >= 300) {
    let body: ErrorMessage | undefined;
    try {
      const jsonBody = await response.json();
      body = getErrorMessage(jsonBody);
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

// {
//   "error": {
//     "message": "Incorrect API key provided: sk-DnweH**************************************qMr3. You can find your API key at https://platform.openai.com/account/api-keys.",
//     "type": "invalid_request_error",
//     "param": null,
//     "code": "invalid_api_key"
//   }
// }

export type ErrorMessage = {
  error: {
    message: string;
    type: string;
    code: string;
    param: unknown;
  };
};

export function requireApiKey(settings: TTSPluginSettings): string | undefined {
  if (!settings.API_KEY) {
    return `Please enter an API key in the "${MARKETING_NAME_LONG}" plugin settings`;
  }
  return undefined;
}
