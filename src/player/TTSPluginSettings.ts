import { action, observable } from "mobx";
import { TTSErrorInfo, TTSModelOptions, listModels } from "./TTSModel";
import { debounce } from "../util/misc";
import { hashString } from "../util/Minhash";

// 自定义音色接口
export interface CustomVoice {
  id: string;
  name: string;
  description: string;
  // 注意：referenceAudio和referenceText暂时不在UI中配置
  // 这些参数将来可能用于高级音色克隆功能
  referenceAudio?: string;
  referenceText?: string;
}



export type TTSPluginSettings = {
  OPENAI_API_KEY: string;
  OPENAI_API_URL: string;
  modelProvider: ModelProvider;
  model: string;
  ttsVoice: string;
  instructions?: string;
  chunkType: "sentence" | "paragraph";
  playbackSpeed: number;
  cacheType: "local" | "vault";
  cacheDurationMillis: number;
  showPlayerView: PlayerViewMode;
  version: number;
  audioFolder: string;
  // 新增：自定义音色列表
  customVoices: CustomVoice[];
} & OpenAIModelConfig &
  OpenAICompatibleModelConfig;

export interface OpenAIModelConfig {
  openai_apiKey: string;
  openai_ttsModel: string;
  openai_ttsVoice: string;
  openai_ttsInstructions?: string;
}

export interface OpenAICompatibleModelConfig {
  openaicompat_apiKey: string;
  openaicompat_apiBase: string;
  openaicompat_ttsModel: string;
  openaicompat_ttsVoice: string;
}

export const playViewModes = [
  "always",
  "always-mobile",
  "playing",
  "never",
] as const;

export type PlayerViewMode = (typeof playViewModes)[number];

export function isPlayerViewMode(value: unknown): value is PlayerViewMode {
  return playViewModes.includes(value as PlayerViewMode);
}

export function voiceHash(options: TTSModelOptions): string {
  return hashString(
    options.apiUri +
      options.model +
      options.voice +
      (options.instructions || ""),
  ).toString();
}

export const REAL_OPENAI_API_URL = "https://api.openai.com";

export const modelProviders = ["openai", "openaicompat"] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const DEFAULT_SETTINGS: TTSPluginSettings = {
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "",
  modelProvider: "openai",
  model: "gpt-4o-mini-tts",
  ttsVoice: "shimmer",
  instructions: undefined,
  chunkType: "sentence",
  playbackSpeed: 1.0,
  cacheDurationMillis: 1000 * 60 * 60 * 24 * 7, // 7 days
  cacheType: "local",
  showPlayerView: "always-mobile",
  // openai
  openai_apiKey: "",
  openai_ttsModel: "gpt-4o-mini-tts",
  openai_ttsVoice: "shimmer",
  openai_ttsInstructions: undefined,
  // openaicompat
  openaicompat_apiKey: "",
  openaicompat_apiBase: "",
  openaicompat_ttsModel: "",
  openaicompat_ttsVoice: "",
  version: 1,
  audioFolder: "aloud",
  // 新增：自定义音色列表
  customVoices: [],
} as const;

export const MARKETING_NAME = "Aloud";
export const MARKETING_NAME_LONG = "Aloud: text to speech";

export interface TTSPluginSettingsStore {
  settings: TTSPluginSettings;
  apiKeyValid?: boolean;
  apiKeyError?: string;
  checkApiKey: () => void;
  updateSettings: (settings: Partial<TTSPluginSettings>) => Promise<void>;
  updateModelSpecificSettings: (
    provider: ModelProvider,
    settings: Partial<TTSPluginSettings>,
  ) => Promise<void>;
  setSpeed(speed: number): void;
  // 新增：自定义音色管理方法
  addCustomVoice: (voice: CustomVoice) => Promise<void>;
  removeCustomVoice: (voiceId: string) => Promise<void>;
  // 新增：获取可用音色列表（本地音色）
  getAvailableVoices: () => Promise<CustomVoice[]>;
  // 新增：获取可用音色列表（包括服务器音色）- 用于手动刷新
  getAvailableVoicesWithRemote: () => Promise<CustomVoice[]>;
}

export async function pluginSettingsStore(
  loadData: () => Promise<unknown>,
  saveData: (data: unknown) => Promise<void>,
): Promise<TTSPluginSettingsStore> {
  const store = observable(
    {
      settings: parsePluginSettings(await loadData()),
      apiKeyValid: undefined,
      apiKeyError: undefined,
      setApiKeyValidity(valid?: boolean, error?: string) {
        this.apiKeyValid = valid;
        this.apiKeyError = error;
      },
      checkApiKey: debounce(async () => {
        console.log('开始检查API key...');
        
        // 根据模型提供商读取正确的API Key和URL
        let apiKey: string;
        let apiUrl: string;
        
        if (store.settings.modelProvider === "openaicompat") {
          apiKey = store.settings.openaicompat_apiKey;
          apiUrl = store.settings.openaicompat_apiBase || store.settings.OPENAI_API_URL;
        } else {
          apiKey = store.settings.openai_apiKey || store.settings.OPENAI_API_KEY;
          apiUrl = store.settings.OPENAI_API_URL;
        }
        
        console.log('模型提供商:', store.settings.modelProvider);
        console.log('API URL:', apiUrl);
        console.log('API Key存在:', !!apiKey);
        
        if (
          apiUrl &&
          apiUrl !== REAL_OPENAI_API_URL
        ) {
          console.log('检测到自定义API URL，类型:', apiUrl);
          // 对于自定义API URL，如果API key为空，假设是本地部署不需要认证
          if (!apiKey) {
            console.log('无API key，假设为本地部署');
            store.setApiKeyValidity(true, "Local deployment (no API key required)");
          } else {
            console.log('有API key，尝试验证...');
            // 如果提供了API key，尝试验证
            store.setApiKeyValidity(undefined, undefined);
            try {
              await listModels(store.settings);
              console.log('API key验证成功');
              store.setApiKeyValidity(true, undefined);
            } catch (ex: unknown) {
              console.error("Could not validate API key for custom endpoint", ex);
              let message = "Cannot connect to custom API endpoint";
              if (ex instanceof TTSErrorInfo) {
                console.log('TTSErrorInfo详情:', ex.status, ex.httpErrorCode, ex.errorDetails);
                if (ex.openAIErrorCode() === "invalid_api_key") {
                  message = "Invalid API key for custom endpoint";
                } else {
                  const msg = ex.openAIJsonMessage();
                  if (msg) {
                    message = msg;
                  }
                }
              }
              console.log('API key验证失败，错误:', message);
              store.setApiKeyValidity(false, message);
            }
          }
        } else {
          console.log('使用OpenAI官方API');
          if (!apiKey) {
            store.setApiKeyValidity(
              false,
              `Please enter an API key in the "${MARKETING_NAME_LONG}" plugin settings`,
            );
          } else {
            store.setApiKeyValidity(undefined, undefined);
            try {
              await listModels(store.settings);
              store.setApiKeyValidity(true, undefined);
            } catch (ex: unknown) {
              console.error("Could not validate API key", ex);
              let message = "Cannot connect to OpenAI";
              if (ex instanceof TTSErrorInfo) {
                if (ex.openAIErrorCode() === "invalid_api_key") {
                  message =
                    "Invalid API key! Enter a valid API key in the plugin settings";
                } else {
                  const msg = ex.openAIJsonMessage();
                  if (msg) {
                    message = msg;
                  }
                }
              }
              store.setApiKeyValidity(false, message);
            }
          }
        }
      }, 500),
      updateSettings: async (
        update: Partial<TTSPluginSettings>,
      ): Promise<void> => {
        const keyBefore = store.settings.OPENAI_API_KEY;
        const apiBefore = store.settings.OPENAI_API_URL;
        Object.assign(store.settings, update);
        if (
          keyBefore !== store.settings.OPENAI_API_KEY ||
          apiBefore !== store.settings.OPENAI_API_URL
        ) {
          await store.checkApiKey();
        }
        await saveData(store.settings);
      },
      async updateModelSpecificSettings(
        provider: ModelProvider,
        settings: Partial<TTSPluginSettings>,
      ) {
        const merged = {
          ...store.settings,
          ...settings,
        };
        const additionalSettings: Partial<TTSPluginSettings> =
          provider === "openai"
            ? {
                OPENAI_API_KEY: merged.openai_apiKey,
                OPENAI_API_URL: "",
                ttsVoice: merged.openai_ttsVoice,
                instructions: merged.openai_ttsInstructions || undefined,
                model: merged.openai_ttsModel,
              }
            : {
                OPENAI_API_KEY: merged.openaicompat_apiKey,
                OPENAI_API_URL: merged.openaicompat_apiBase,
                ttsVoice: merged.openaicompat_ttsVoice,
                instructions: undefined,
                model: merged.openaicompat_ttsModel,
              };
        await store.updateSettings({
          ...settings,
          ...additionalSettings,
          modelProvider: provider,
        });
      },
      setSpeed(speed: number): void {
        store.updateSettings({
          playbackSpeed: Math.round(speed * 20) / 20,
        });
      },
      // 新增：添加自定义音色
      addCustomVoice: async (voice: CustomVoice): Promise<void> => {
        const existingIndex = store.settings.customVoices.findIndex(
          (v) => v.id === voice.id,
        );
        let updatedVoices: CustomVoice[];
        
        if (existingIndex >= 0) {
          // 更新现有音色
          updatedVoices = [...store.settings.customVoices];
          updatedVoices[existingIndex] = voice;
        } else {
          // 添加新音色
          updatedVoices = [...store.settings.customVoices, voice];
        }
        
        await store.updateSettings({ customVoices: updatedVoices });
      },
      // 新增：删除自定义音色
      removeCustomVoice: async (voiceId: string): Promise<void> => {
        const updatedVoices = store.settings.customVoices.filter(
          (v) => v.id !== voiceId,
        );
        await store.updateSettings({ customVoices: updatedVoices });
      },
      // 新增：获取可用音色列表（本地音色）
      getAvailableVoices: async (): Promise<CustomVoice[]> => {
        // 只返回本地自定义音色，不调用远程API
        return store.settings.customVoices;
      },
      // 新增：获取可用音色列表（包括服务器音色）- 用于手动刷新
      getAvailableVoicesWithRemote: async (): Promise<CustomVoice[]> => {
        try {
          // 导入listVoices函数
          const { listVoices } = await import("./TTSModel");
          const serverVoices = await listVoices(store.settings);
          
          // 转换服务器音色格式
          const serverVoicesAsCustom: CustomVoice[] = serverVoices.map((voice) => ({
            id: voice.id,
            name: voice.name,
            description: voice.description,
          }));
          
          // 合并服务器音色和自定义音色，去重
          const customVoicesNotInServer = store.settings.customVoices.filter(
            (customVoice) => !serverVoices.some((serverVoice) => serverVoice.id === customVoice.id),
          );
          
          return [...serverVoicesAsCustom, ...customVoicesNotInServer];
        } catch (error) {
          console.warn("Failed to fetch server voices, using custom voices only:", error);
          return store.settings.customVoices;
        }
      },
    },
    {
      settings: observable,
      apiKeyValid: observable,
      apiKeyError: observable,
      setApiKeyValidity: action,
      updateSettings: action,
      updateModelSpecificSettings: action,
      setSpeed: action,
      addCustomVoice: action,
      removeCustomVoice: action,
      getAvailableVoices: action,
      getAvailableVoicesWithRemote: action,
    },
  );
  store.checkApiKey();
  return store;
}

const parsePluginSettings = (toParse: unknown): TTSPluginSettings => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = toParse as any;
  data = toParse
    ? {
        ...DEFAULT_SETTINGS,
        version: data.version || 0,
        ...data,
      }
    : { ...DEFAULT_SETTINGS };
  if (data.version < 1) {
    data = migrateToVersion1(data);
  }
  return data;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateToVersion1(data: any): any {
  // extract the openai_apiKey and openai_apiBase fields
  const isCustom =
    !!data.OPENAI_API_URL && data.OPENAI_API_URL !== REAL_OPENAI_API_URL;
  return {
    ...data,
    modelProvider: isCustom ? "openaicompat" : "openai",
    ...(isCustom
      ? {
          openaicompat_apiKey: data.OPENAI_API_KEY,
          openaicompat_apiBase: data.OPENAI_API_URL,
          openaicompat_ttsModel: data.model,
          openaicompat_ttsVoice: data.ttsVoice,
        }
      : {
          openai_apiKey: data.OPENAI_API_KEY,
          openai_ttsModel: data.model,
          openai_ttsVoice: data.ttsVoice,
        }),
    version: 1,
  };
}
