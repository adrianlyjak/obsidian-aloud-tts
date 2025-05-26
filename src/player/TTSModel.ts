import { REAL_OPENAI_API_URL, TTSPluginSettings, CustomVoice } from "./TTSPluginSettings";

/**
 * options used by the audio model. Some options are used as a cache key, such that changes to the options
 * will cause audio to reload
 */
export interface TTSModelOptions {
  model: string;
  voice: string;
  instructions?: string;
  apiUri: string;
  apiKey: string;
  referenceAudio?: string;
  referenceText?: string;
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

  openAIJsonMessage(): string | undefined {
    return (this.errorDetails as ErrorMessage)?.error?.message;
  }
  openAIErrorCode(): string | undefined {
    return (this.errorDetails as ErrorMessage)?.error?.code;
  }
}

export function toModelOptions(
  pluginSettings: TTSPluginSettings,
): TTSModelOptions {
  return {
    model: pluginSettings.model,
    voice: pluginSettings.ttsVoice,
    instructions: pluginSettings.instructions || undefined,
    apiUri: pluginSettings.OPENAI_API_URL || REAL_OPENAI_API_URL,
    apiKey: pluginSettings.OPENAI_API_KEY,
  };
}

export interface TTSModel {
  (text: string, options: TTSModelOptions): Promise<ArrayBuffer>;
}

export const openAITextToSpeech: TTSModel = async function openAITextToSpeech(
  text: string,
  options: TTSModelOptions,
): Promise<ArrayBuffer> {
  // 构建请求体，支持自定义音色参数
  const requestBody: any = {
    model: options.model,
    voice: options.voice,
    input: text,
    speed: 1,
  };

  // 添加指令（如果有）
  if (options.instructions) {
    requestBody.instructions = options.instructions;
  }

  // 添加自定义音色参数（用于零样本声音克隆）
  if (options.referenceAudio) {
    requestBody.reference_audio = [options.referenceAudio];
  }
  if (options.referenceText) {
    requestBody.reference_text = [options.referenceText];
  }



  const headers = await fetch(
    orDefaultOpenAI(options.apiUri) + "/v1/audio/speech",
    {
      headers: {
        Authorization: "Bearer " + options.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify(requestBody),
    },
  );
  await validate200(headers);
  const bf = await headers.arrayBuffer();
  return bf;
};

function orDefaultOpenAI(maybeUrl: string): string {
  return maybeUrl.replace(/\/$/, "") || REAL_OPENAI_API_URL;
}

export async function listModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  const headers = await fetch(
    orDefaultOpenAI(settings.OPENAI_API_URL) + "/v1/models",
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + settings.OPENAI_API_KEY,
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

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
}

export async function listVoices(
  settings: TTSPluginSettings,
): Promise<VoiceInfo[]> {
  try {
    const response = await fetch(
      orDefaultOpenAI(settings.OPENAI_API_URL) + "/v1/voices",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + settings.OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    
    if (response.status === 404) {
      return getDefaultVoices();
    }
    
    await validate200(response);
    const data = await response.json();
    
    if (data.voices && Array.isArray(data.voices)) {
      return data.voices.map((voice: any) => ({
        id: voice.id || voice.voice_id,
        name: voice.name || voice.id || voice.voice_id,
        description: voice.description || "",
      }));
    }
    
    return getDefaultVoices();
  } catch (error) {
    console.warn("Failed to fetch voices from server, using defaults:", error);
    return getDefaultVoices();
  }
}

function getDefaultVoices(): VoiceInfo[] {
  return [
    { id: "alloy", name: "Alloy", description: "中性声音" },
    { id: "echo", name: "Echo", description: "男性声音" },
    { id: "fable", name: "Fable", description: "英式男性声音" },
    { id: "onyx", name: "Onyx", description: "深沉男性声音" },
    { id: "nova", name: "Nova", description: "年轻女性声音" },
    { id: "shimmer", name: "Shimmer", description: "温和女性声音" },
  ];
}
