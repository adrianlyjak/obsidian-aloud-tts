import { action, observable } from "mobx";
import { TTSModelOptions } from "../models/tts-model";
import { debounce } from "../util/misc";
import { hashStrings } from "../util/Minhash";
import { OPENAI_API_URL } from "../models/openai";
import { REGISTRY } from "../models/registry";

export type TTSPluginSettings = {
  API_KEY: string;
  API_URL: string;
  modelProvider: ModelProvider;
  model: string;
  ttsVoice?: string;
  sourceType: string;
  instructions?: string;
  contextMode?: boolean;
  chunkType: "sentence" | "paragraph";
  playbackSpeed: number;
  cacheType: "local" | "vault";
  cacheDurationMillis: number;
  showPlayerView: PlayerViewMode;
  version: number;
  audioFolder: string;
} & (GeminiModelConfig &
  HumeModelConfig &
  OpenAIModelConfig &
  OpenAICompatModelConfig);

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
}

export interface OpenAICompatModelConfig {
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
  return hashStrings([
    options.apiUri +
      (options.model || "") +
      options.voice +
      (options.instructions || ""),
  ])[0].toString();
}

export const modelProviders = [
  "gemini",
  "hume",
  "openai",
  "openaicompat",
] as const;
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
  // openaicompat
  openaicompat_apiKey: "",
  openaicompat_apiBase: "",
  openaicompat_ttsModel: "",
  openaicompat_ttsVoice: "",

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
        store.setApiKeyValidity(undefined, undefined);
        const error = await REGISTRY[
          store.settings.modelProvider
        ].validateConnection(store.settings);
        store.setApiKeyValidity(error ? false : true, error);
      }, 500),
      updateSettings: async (
        update: Partial<TTSPluginSettings>,
      ): Promise<void> => {
        const keyBefore = store.settings.API_KEY;
        const apiBefore = store.settings.API_URL;
        const providerBefore = store.settings.modelProvider;
        Object.assign(store.settings, update);
        if (
          keyBefore !== store.settings.API_KEY ||
          apiBefore !== store.settings.API_URL ||
          providerBefore !== store.settings.modelProvider
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
        const additionalSettings =
          REGISTRY[provider].applyModelSpecificSettings(merged);
        await store.updateSettings({
          ...merged,
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
    !!data.OPENAI_API_URL && data.OPENAI_API_URL !== OPENAI_API_URL;
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
