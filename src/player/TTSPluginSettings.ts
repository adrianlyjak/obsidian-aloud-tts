import { action, observable } from "mobx";
import { TTSErrorInfo, TTSModelOptions, listModels } from "./TTSModel";
import { debounce } from "../util/misc";
import { hashString } from "../util/Minhash";
export type TTSPluginSettings = {
  OPENAI_API_KEY: string;
  OPENAI_API_URL: string;
  modelProvider: ModelProvider;
  model: string;
  ttsVoice: string;
  chunkType: "sentence" | "paragraph";
  playbackSpeed: number;
  cacheType: "local" | "vault";
  cacheDurationMillis: number;
  showPlayerView: PlayerViewMode;
  version: number;
} & OpenAIModelConfig &
  OpenAICompatibleModelConfig;

export interface OpenAIModelConfig {
  openai_apiKey: string;
  openai_ttsModel: string;
  openai_ttsVoice: string;
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
  return hashString(options.apiUri + options.model + options.voice).toString();
}

export const REAL_OPENAI_API_URL = "https://api.openai.com";

export const modelProviders = ["openai", "openaicompat"] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const DEFAULT_SETTINGS: TTSPluginSettings = {
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "",
  modelProvider: "openai",
  model: "tts-1", // tts-1-hd
  ttsVoice: "shimmer", // alloy, echo, fable, onyx, nova, and shimmer
  chunkType: "sentence",
  playbackSpeed: 1.0,
  cacheDurationMillis: 1000 * 60 * 60 * 24 * 7, // 7 days
  cacheType: "local",
  showPlayerView: "always-mobile",
  // openai
  openai_apiKey: "",
  openai_ttsModel: "tts-1",
  openai_ttsVoice: "shimmer",
  // openaicompat
  openaicompat_apiKey: "",
  openaicompat_apiBase: "",
  openaicompat_ttsModel: "",
  openaicompat_ttsVoice: "",
  version: 1,
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
        if (
          store.settings.OPENAI_API_URL &&
          store.settings.OPENAI_API_URL !== REAL_OPENAI_API_URL
        ) {
          store.setApiKeyValidity(true);
        } else {
          if (!store.settings.OPENAI_API_KEY) {
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
                model: merged.openai_ttsModel,
              }
            : {
                OPENAI_API_KEY: merged.openaicompat_apiKey,
                OPENAI_API_URL: merged.openaicompat_apiBase,
                ttsVoice: merged.openaicompat_ttsVoice,
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
    },
    {
      settings: observable,
      apiKeyValid: observable,
      apiKeyError: observable,
      setApiKeyValidity: action,
      updateSettings: action,
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
