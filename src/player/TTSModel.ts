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
  // 根据模型提供商读取正确的API Key
  let apiKey: string;
  let apiUrl: string;
  
  if (pluginSettings.modelProvider === "openaicompat") {
    apiKey = pluginSettings.openaicompat_apiKey;
    apiUrl = pluginSettings.openaicompat_apiBase || pluginSettings.OPENAI_API_URL;
  } else {
    apiKey = pluginSettings.openai_apiKey || pluginSettings.OPENAI_API_KEY;
    apiUrl = pluginSettings.OPENAI_API_URL;
  }
  
  console.log('🔧 toModelOptions调试信息:');
  console.log('  - modelProvider:', pluginSettings.modelProvider);
  console.log('  - 使用的API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'undefined/empty');
  console.log('  - 使用的API URL:', apiUrl);
  
  return {
    model: pluginSettings.model,
    voice: pluginSettings.ttsVoice,
    instructions: pluginSettings.instructions || undefined,
    apiUri: apiUrl || REAL_OPENAI_API_URL,
    apiKey: apiKey,
  };
}

export interface TTSModel {
  (text: string, options: TTSModelOptions): Promise<ArrayBuffer>;
}

// 检测API提供商类型
function detectAPIProvider(apiUri: string): 'openai' | 'siliconflow' | 'local' | 'other' {
  if (!apiUri || apiUri === REAL_OPENAI_API_URL) {
    return 'openai';
  }
  if (apiUri.includes('siliconflow.cn')) {
    return 'siliconflow';
  }
  if (apiUri.includes('localhost') || apiUri.includes('127.0.0.1') || apiUri.includes('0.0.0.0')) {
    return 'local';
  }
  return 'other';
}

export const openAITextToSpeech: TTSModel = async function openAITextToSpeech(
  text: string,
  options: TTSModelOptions,
): Promise<ArrayBuffer> {
  // 检测API提供商类型
  const apiProvider = detectAPIProvider(options.apiUri);
  
  // 构建请求体，支持自定义音色参数
  const requestBody: any = {
    model: options.model,
    voice: options.voice,
    input: text,
    response_format: "mp3",
  };

  // 根据API提供商添加特定参数
  switch (apiProvider) {
    case 'siliconflow':
      // 根据硅基流动官方文档设置参数
      requestBody.sample_rate = 32000;
      requestBody.stream = false;  // 使用非流式模式以简化处理
      requestBody.speed = 1;
      requestBody.gain = 0;
      console.log('硅基流动API请求体:', JSON.stringify(requestBody, null, 2));
      break;
      
    case 'openai':
      // OpenAI标准参数
      requestBody.speed = 1.0;
      break;
      
    case 'local':
    case 'other':
      // 本地部署和其他API，使用基本参数
      requestBody.speed = 1.0;
      break;
  }

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

  // 构建请求头，只有在API key存在时才添加Authorization
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (options.apiKey) {
    headers.Authorization = "Bearer " + options.apiKey;
  }

  const apiUrl = orDefaultOpenAI(options.apiUri) + "/v1/audio/speech";
  console.log(`正在调用${apiProvider} API:`, apiUrl);
  console.log('请求头:', headers);
  console.log('请求体:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(apiUrl, {
      headers,
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    console.log(`${apiProvider} API响应状态:`, response.status, response.statusText);
    
    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.text();
        console.error(`${apiProvider} API错误响应:`, errorBody);
      } catch (e) {
        console.error('无法读取错误响应体');
      }
    }

    await validate200(response);
    const bf = await response.arrayBuffer();
    console.log(`${apiProvider} API成功返回音频数据，大小:`, bf.byteLength);
    return bf;
  } catch (error) {
    console.error(`${apiProvider} API调用失败:`, error);
    throw error;
  }
};

function orDefaultOpenAI(maybeUrl: string): string {
  return maybeUrl.replace(/\/$/, "") || REAL_OPENAI_API_URL;
}

export async function listModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  // 根据模型提供商读取正确的API Key和URL
  let apiKey: string;
  let apiUrl: string;
  
  if (settings.modelProvider === "openaicompat") {
    apiKey = settings.openaicompat_apiKey;
    apiUrl = settings.openaicompat_apiBase || settings.OPENAI_API_URL;
  } else {
    apiKey = settings.openai_apiKey || settings.OPENAI_API_KEY;
    apiUrl = settings.OPENAI_API_URL;
  }
  
  // 检测API提供商类型
  const apiProvider = detectAPIProvider(apiUrl);
  
  // 构建请求头，只有在API key存在时才添加Authorization
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (apiKey) {
    headers.Authorization = "Bearer " + apiKey;
  }

  try {
    const response = await fetch(
      orDefaultOpenAI(apiUrl) + "/v1/models",
      {
        method: "GET",
        headers,
      },
    );
    
    // 如果404，对于本地部署可能是正常的
    if (response.status === 404 && apiProvider === 'local') {
      console.warn("Models endpoint not available on local deployment, this is usually normal");
      return ["local-tts"]; // 返回一个默认模型名
    }
    
    await validate200(response);
    const data = await response.json();
    
    // 根据不同API提供商解析响应
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((model: any) => model.id || model.name || model);
    } else if (data.models && Array.isArray(data.models)) {
      return data.models.map((model: any) => model.id || model.name || model);
    } else if (Array.isArray(data)) {
      return data.map((model: any) => model.id || model.name || model);
    }
    
    console.warn("Unrecognized models response format");
    return ["default-model"];
  } catch (error) {
    console.warn("Failed to fetch models, this might be normal for local deployments:", error);
    return ["default-model"];
  }
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
    // 根据模型提供商读取正确的API Key和URL
    let apiKey: string;
    let apiUrl: string;
    
    if (settings.modelProvider === "openaicompat") {
      apiKey = settings.openaicompat_apiKey;
      apiUrl = settings.openaicompat_apiBase || settings.OPENAI_API_URL;
    } else {
      apiKey = settings.openai_apiKey || settings.OPENAI_API_KEY;
      apiUrl = settings.OPENAI_API_URL;
    }
    
    // 检测API提供商类型
    const apiProvider = detectAPIProvider(apiUrl);
    
    // 构建请求头，只有在API key存在时才添加Authorization
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (apiKey) {
      headers.Authorization = "Bearer " + apiKey;
    }

    const response = await fetch(
      orDefaultOpenAI(apiUrl) + "/v1/models/info",
      {
        method: "GET",
        headers,
      },
    );
    
    if (response.status === 404) {
      console.warn("API endpoint /v1/models/info not found, using default voices");
      return getDefaultVoices();
    }
    
    await validate200(response);
    const data = await response.json();
    
    // 根据API提供商解析不同的响应格式
    switch (apiProvider) {
      case 'siliconflow':
        // 硅基流动可能有特定的响应格式
        if (data.models && Array.isArray(data.models)) {
          const allVoices: VoiceInfo[] = [];
          
          for (const model of data.models) {
            if (model.voices && Array.isArray(model.voices)) {
              const modelVoices = model.voices.map((voice: any) => ({
                id: voice.name || voice.id,
                name: voice.name || voice.id,
                description: `${voice.description || 'Voice'} (${model.model_name || model.id})`,
              }));
              allVoices.push(...modelVoices);
            }
          }
          
          return allVoices.length > 0 ? allVoices : getDefaultVoices();
        }
        break;
        
      case 'local':
      case 'other':
      default:
        // 标准格式解析
        if (data.models && Array.isArray(data.models)) {
          const allVoices: VoiceInfo[] = [];
          
          for (const model of data.models) {
            if (model.voices && Array.isArray(model.voices)) {
              const modelVoices = model.voices.map((voice: any) => ({
                id: voice.name || voice.id,
                name: voice.name || voice.id,
                description: `${voice.description || 'Voice'} (${model.model_name || model.id})`,
              }));
              allVoices.push(...modelVoices);
            }
          }
          
          return allVoices.length > 0 ? allVoices : getDefaultVoices();
        }
        
        // 如果是简单的voices数组格式
        if (data.voices && Array.isArray(data.voices)) {
          return data.voices.map((voice: any) => ({
            id: voice.name || voice.id,
            name: voice.name || voice.id,
            description: voice.description || 'Voice',
          }));
        }
        break;
    }
    
    console.warn("Unrecognized voice list format, using default voices");
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
