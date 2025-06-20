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
} & OpenAIModelConfig & OpenAICompatModelConfig & HumeModelConfig;

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

export interface HumeModelConfig {
  hume_apiKey: string;
  hume_ttsVoice?: string;
  hume_sourceType: string;
  hume_ttsInstructions?: string;
  hume_contextMode: boolean;
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

export const REAL_OPENAI_API_URL = "https://api.openai.com";
export const REAL_HUME_API_URL = "https://api.hume.ai";

export const modelProviders = ["openai", "openaicompat", "hume"] as const;
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
  // hume
  hume_apiKey: "",
  hume_ttsVoice: undefined,
  hume_sourceType: "HUME_AI",
  hume_ttsInstructions: undefined,
  hume_contextMode: false,

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
          store.settings.API_URL !== REAL_OPENAI_API_URL &&
          store.settings.API_URL !== REAL_HUME_API_URL
        ) {
          store.setApiKeyValidity(true);
        } else if (!store.settings.API_KEY) {
          store.setApiKeyValidity(
            false,
            `Please enter an API key in the "${MARKETING_NAME_LONG}" plugin settings`,
          );
        } else if (store.settings.modelProvider !== "hume") {
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
        const additionalSettings: Partial<TTSPluginSettings> =
          provider === "openai"
            ? {
              API_KEY: merged.openai_apiKey,
              API_URL: REAL_OPENAI_API_URL,
              ttsVoice: merged.openai_ttsVoice,
              instructions: merged.openai_ttsInstructions || undefined,
              model: merged.openai_ttsModel,
              contextMode: merged.openai_contextMode,
            }
            : provider === "openaicompat"
            ? {
              API_KEY: merged.openaicompat_apiKey,
              API_URL: merged.openaicompat_apiBase,
              ttsVoice: merged.openaicompat_ttsVoice,
              instructions: undefined,
              model: merged.openaicompat_ttsModel,
              contextMode: merged.openaicompat_contextMode,
            }
            : provider === "hume"
            ? {
              API_KEY: merged.hume_apiKey,
              API_URL: REAL_HUME_API_URL,
              ttsVoice: merged.hume_ttsVoice || undefined,
              sourceType: merged.hume_sourceType,
              instructions: merged.hume_ttsInstructions || undefined,
              contextMode: merged.hume_contextMode,
            }
            : {};
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
  const isHume = data.API_URL === REAL_HUME_API_URL;
  const isCustom =
    !!data.API_URL &&
    data.API_URL !== REAL_OPENAI_API_URL &&
    !isHume;

  let providerSettings = {};
  let modelProvider: ModelProvider = "openai";

  if (isCustom) {
    modelProvider = "openaicompat";
    providerSettings = {
      openaicompat_apiKey: data.API_KEY,
      openaicompat_apiBase: data.API_URL,
      openaicompat_ttsModel: data.model,
      openaicompat_ttsVoice: data.ttsVoice,
      openaicompat_contextMode: data.contextMode,
    };
  } else if (isHume) {
    modelProvider = "hume";
    providerSettings = {
      hume_apiKey: data.API_KEY,
      hume_ttsVoice: data.ttsVoice,
      hume_sourceType: data.sourceType,
      hume_contextMode: data.contextMode,
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
