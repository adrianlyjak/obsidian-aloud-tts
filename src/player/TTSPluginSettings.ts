import { action, observable } from "mobx";
import { TTSErrorInfo, TTSModelOptions, listOpenAIModels } from "./TTSModel";
import { debounce } from "../util/misc";
import { hashStrings } from "../util/Minhash";
export type TTSPluginSettings = {
  API_KEY: string;
  API_URL: string;
  modelProvider: ModelProvider;
  model: string;
  ttsVoice?: string;
  sourceType: string;
  instructions?: string;
  contextMode: boolean;
  chunkType: "sentence" | "paragraph";
  playbackSpeed: number;
  cacheType: "local" | "vault";
  cacheDurationMillis: number;
  showPlayerView: PlayerViewMode;
  version: number;
  audioFolder: string;
} & (
  GeminiModelConfig &
  HumeModelConfig &
  OpenAIModelConfig &
  OpenAICompatModelConfig
);

export interface GeminiModelConfig {
  gemini_apiKey: string;
  gemini_ttsModel: string;
  gemini_ttsVoice: string;
  gemini_ttsInstructions?: string;
  gemini_contextMode: boolean;
}

export interface HumeModelConfig {
  hume_apiKey: string;
  hume_ttsVoice?: string;
  hume_sourceType: string;
  hume_ttsInstructions?: string;
  hume_contextMode: boolean;
}

export interface OpenAIModelConfig {
  openai_apiKey: string;
  openai_ttsModel: string;
  openai_ttsVoice: string;
  openai_ttsInstructions?: string;
  openai_contextMode: boolean;
}

export interface OpenAICompatModelConfig {
  openaicompat_apiKey: string;
  openaicompat_apiBase: string;
  openaicompat_ttsModel: string;
  openaicompat_ttsVoice: string;
  openaicompat_contextMode: false;
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
  return hashStrings(
    [options.apiUri + (options.model || "") + options.voice + (options.instructions || "")],
  )[0].toString();
}

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com";
export const HUME_API_URL = "https://api.hume.ai";
export const OPENAI_API_URL = "https://api.openai.com";

export const modelProviders = ["gemini", "hume", "openai", "openaicompat"] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const DEFAULT_SETTINGS: TTSPluginSettings = {
  API_KEY: "",
  API_URL: "",
  modelProvider: "openai",
  model: "gpt-4o-mini-tts",
  ttsVoice: "shimmer",
  sourceType: "",
  instructions: undefined,
  contextMode: false,
  chunkType: "sentence",
  playbackSpeed: 1.0,
  cacheDurationMillis: 1000 * 60 * 60 * 24 * 7, // 7 days
  cacheType: "local",
  showPlayerView: "always-mobile",
  // gemini
  gemini_apiKey: "",
  gemini_ttsModel: "gemini-2.5-flash-preview-tts",
  gemini_ttsVoice: "Zephyr",
  gemini_ttsInstructions: undefined,
  gemini_contextMode: false,
  // hume
  hume_apiKey: "",
  hume_ttsVoice: undefined,
  hume_sourceType: "HUME_AI",
  hume_ttsInstructions: undefined,
  hume_contextMode: false,
  // openai
  openai_apiKey: "",
  openai_ttsModel: "gpt-4o-mini-tts",
  openai_ttsVoice: "shimmer",
  openai_ttsInstructions: undefined,
  openai_contextMode: false,
  // openaicompat
  openaicompat_apiKey: "",
  openaicompat_apiBase: "",
  openaicompat_ttsModel: "",
  openaicompat_ttsVoice: "",
  openaicompat_contextMode: false,

  version: 1,
  audioFolder: "aloud",
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
          store.settings.API_URL &&
          store.settings.API_URL !== GEMINI_API_URL &&
          store.settings.API_URL !== HUME_API_URL &&
          store.settings.API_URL !== OPENAI_API_URL
        ) {
          store.setApiKeyValidity(true);
        } else if (!store.settings.API_KEY) {
          store.setApiKeyValidity(
            false,
            `Please enter an API key in the "${MARKETING_NAME_LONG}" plugin settings`,
          );
        } else if (store.settings.modelProvider === "openai") {
          store.setApiKeyValidity(undefined, undefined);

          try {
            await listOpenAIModels(store.settings);
            store.setApiKeyValidity(true, undefined);
          } catch (ex: unknown) {
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
            store.setApiKeyValidity(false, message);
          }
        } else {
          store.setApiKeyValidity(true);
        }
      }, 500),
      updateSettings: async (
        update: Partial<TTSPluginSettings>,
      ): Promise<void> => {
        const keyBefore = store.settings.API_KEY;
        const apiBefore = store.settings.API_URL;
        Object.assign(store.settings, update);
        if (
          keyBefore !== store.settings.API_KEY ||
          apiBefore !== store.settings.API_URL
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
        let additionalSettings: Partial<TTSPluginSettings>;
        switch (provider) {
          case "gemini":
            additionalSettings = {
              API_KEY: merged.gemini_apiKey,
              API_URL: GEMINI_API_URL,
              ttsVoice: merged.gemini_ttsVoice,
              instructions: merged.gemini_ttsInstructions || undefined,
              model: merged.gemini_ttsModel,
              contextMode: merged.gemini_contextMode,
            }
            break;
          case "hume":
            additionalSettings = {
              API_KEY: merged.hume_apiKey,
              API_URL: HUME_API_URL,
              ttsVoice: merged.hume_ttsVoice || undefined,
              sourceType: merged.hume_sourceType,
              instructions: merged.hume_ttsInstructions || undefined,
              contextMode: merged.hume_contextMode,
            }
            break;
          case "openai":
            additionalSettings = {
              API_KEY: merged.openai_apiKey,
              API_URL: OPENAI_API_URL,
              ttsVoice: merged.openai_ttsVoice,
              instructions: merged.openai_ttsInstructions || undefined,
              model: merged.openai_ttsModel,
              contextMode: merged.openai_contextMode,
            };
            break;
          case "openaicompat":
            additionalSettings = {
              API_KEY: merged.openaicompat_apiKey,
              API_URL: merged.openaicompat_apiBase,
              ttsVoice: merged.openaicompat_ttsVoice,
              instructions: undefined,
              model: merged.openaicompat_ttsModel,
              contextMode: merged.openaicompat_contextMode, // Assuming this is always false
            };
            break;
          default:
            additionalSettings = {};
        }
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
  const isGemini = data.API_URL === GEMINI_API_URL;
  const isHume = data.API_URL === HUME_API_URL;
  const isOpenAI = data.API_URL === OPENAI_API_URL;
  const isCustom = !!data.API_URL && (
    !isGemini &&
    !isHume &&
    !isOpenAI
  );

  let providerSettings = {};
  let modelProvider: ModelProvider = "openai";

  if (isGemini) {
    modelProvider = "gemini";
    providerSettings = {
      gemini_apiKey: data.API_KEY,
      gemini_ttsModel: data.model,
      gemini_ttsVoice: data.ttsVoice,
      gemini_contextMode: data.contextMode,
    };
  } else if (isHume) {
    modelProvider = "hume";
    providerSettings = {
      hume_apiKey: data.API_KEY,
      hume_ttsVoice: data.ttsVoice,
      hume_sourceType: data.sourceType,
      hume_contextMode: data.contextMode,
    };
  } else if (isOpenAI) {
    modelProvider = "openai";
    providerSettings = {
      openai_apiKey: data.API_KEY,
      openai_ttsModel: data.model,
      openai_ttsVoice: data.ttsVoice,
      openai_contextMode: data.contextMode,
    };
  } else if (isCustom) {
    modelProvider = "openaicompat";
    providerSettings = {
      openaicompat_apiKey: data.API_KEY,
      openaicompat_apiBase: data.API_URL,
      openaicompat_ttsModel: data.model,
      openaicompat_ttsVoice: data.ttsVoice,
      openaicompat_contextMode: data.contextMode,
    };
  } else {
    modelProvider = "openai";
    providerSettings = {
      openai_apiKey: data.API_KEY,
      openai_ttsModel: data.model,
      openai_ttsVoice: data.ttsVoice,
      openai_contextMode: data.contextMode,
    };
  }

  return {
    ...data,
    modelProvider: modelProvider,
    ...providerSettings,
    version: 1,
  };
}
