import { action, observable } from "mobx";
import { TTSModelOptions } from "../models/tts-model";
import { debounce } from "../util/misc";
import { hashStrings } from "../util/Minhash";
import { OPENAI_API_URL } from "../models/openai";
import { REGISTRY } from "../models/registry";

export type TTSPluginSettings = {
  modelProvider: ModelProvider;
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
  /** the API key to use */
  gemini_apiKey: string;
  /** the model to use (tts vs tts-hd etc.*/
  gemini_ttsModel: string;
  /** the voice string id to use. Required */
  gemini_ttsVoice: string;
  /** the instructions to use for voice quality. Only applicable to gpt-4o-mini-tts */
  gemini_ttsInstructions?: string;
  /** whether to include previous utterances in the instructions/context */
  gemini_contextMode: boolean;
}

export interface HumeModelConfig {
  /** the API key to use */
  hume_apiKey: string;
  /** the voice UUID to use. I think required */
  hume_ttsVoice?: string;
  /** user defined voices or shared voices */
  hume_sourceType: string;
  /** the instructions to use for voice quality */
  hume_ttsInstructions?: string;
  /** whether to include previous utterances in the instructions/context */
  hume_contextMode: boolean;
}

export interface OpenAIModelConfig {
  /** the API key to use */
  openai_apiKey: string;
  /** the model to use (tts vs tts-hd etc.*/
  openai_ttsModel: string;
  /** the voice string id to use. Required */
  openai_ttsVoice: string;
  /** the instructions to use for voice quality. Only applicable to gpt-4o-mini-tts */
  openai_ttsInstructions?: string;
}

export interface OpenAICompatModelConfig {
  /** the API key to use. Not required */
  openaicompat_apiKey: string;
  /** the backend openai compatible API URL to use */
  openaicompat_apiBase: string;
  /** the model to use. Depends on the backend.*/
  openaicompat_ttsModel: string;
  /** the voice string id to use. Required. Depends on the backend. */
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
  modelProvider: "openai",
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

  version: 2,
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
        const model = REGISTRY[store.settings.modelProvider];
        const optionsBefore = model.convertToOptions(store.settings);
        const providerBefore = store.settings.modelProvider;
        Object.assign(store.settings, update);
        const optionsAfter = model.convertToOptions(store.settings);
        if (
          optionsBefore.apiKey !== optionsAfter.apiKey ||
          optionsBefore.apiUri !== optionsAfter.apiUri ||
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
        await store.updateSettings({
          ...merged,
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
  if (data.version < 2) {
    data = migrateToVersion2(data);
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
    openaicompat_apiKey: isCustom ? data.OPENAI_API_KEY : "",
    openaicompat_apiBase: isCustom ? data.OPENAI_API_URL : "",
    openaicompat_ttsModel: isCustom ? data.model : "",
    openaicompat_ttsVoice: isCustom ? data.ttsVoice : "",
    openai_apiKey: !isCustom ? data.OPENAI_API_KEY : DEFAULT_SETTINGS.openai_apiKey,
    openai_ttsModel: !isCustom ? data.model : DEFAULT_SETTINGS.openai_ttsModel,
    openai_ttsVoice: !isCustom ? data.ttsVoice : DEFAULT_SETTINGS.openai_ttsVoice,

    version: 1,
  };
}

// Dropped the shared fields, those can be computed dynamically,
// and added 2 new models (hume and gemini)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateToVersion2(data: any): any {
  // remove shared fields
  const {
    OPENAI_API_URL,
    OPENAI_API_KEY,
    model,
    ttsVoice,
    instructions,
    ...rest
  } = data;
  // add any fields that were missing before
  return { ...DEFAULT_SETTINGS, ...rest, version: 2 };
}
