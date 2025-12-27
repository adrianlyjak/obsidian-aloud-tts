import {
  MARKETING_NAME_LONG,
  TTSPluginSettings,
} from "../player/TTSPluginSettings";

// --- Audio data primitives ---
export type MediaFormat = "mp3" | "wav" | "pcm";

export interface AudioData {
  /** Raw audio bytes */
  data: ArrayBuffer;
  /** Container/codec format of the audio bytes */
  format: MediaFormat;
  /** PCM metadata - required when format is "pcm" */
  pcmMetadata?: PcmMetadata;
}

export interface PcmMetadata {
  sampleRate: number;
  channels: number;
  bitDepth: 16;
}

export interface AudioTextContext {
  textBefore?: string;
  textAfter?: string;
}

// Interface for batch text-to-speech requests
export interface TTSModel {
  /**
   * Calls text to speech, returning audio data with its media format.
   * For now, providers should return format "mp3" to match the current player assumptions.
   */
  call(
    text: string,
    options: TTSModelOptions,
    settings: TTSPluginSettings,
    context?: AudioTextContext,
  ): Promise<AudioData>;

  /** Returns an error message if the connection is not valid, otherwise undefined */
  validateConnection(settings: TTSPluginSettings): Promise<string | undefined>;

  /**
   * Utility that reads the model provider specific settings (e.g. prefixed fields), and returns a record
   * of shared settings to apply, when this provider is selected. E.g. read openai_apiKey and openai_apiUrl,
   * and return { API_KEY: openai_apiKey, API_URL: openai_apiUrl } */
  convertToOptions(settings: TTSPluginSettings): TTSModelOptions;
}

/**
 * Convert the various provider settings into a generic view.
 * Don't put random crap here, the different models can still read directly from the settings for obscure cases.
 */
export interface TTSModelOptions {
  /** The model name to use */
  model: string;
  /** The voice to use. Often Depends on the model. */
  voice?: string;
  /** The instructions to use for voice quality. Only applicable to some models */
  instructions?: string;
  /** The base API URL to use, if there isn't a default */
  apiUri?: string;
  /** The API key to use. Not required for all models. */
  apiKey?: string;
  /** The response format to request from the API. Only applicable to some models */
  responseFormat?: string;
}

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

export const REQUIRE_API_KEY = `Please enter an API key in the "${MARKETING_NAME_LONG}" plugin settings`;
