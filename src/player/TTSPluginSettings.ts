export interface TTSPluginSettings {
  OPENAI_API_KEY: string;
  OPENAI_API_URL: string;
  model: string;
  ttsVoice: string;
  chunkType: "sentence" | "paragraph";
}

export const DEFAULT_SETTINGS: TTSPluginSettings = {
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com",
  model: "tts-1", // tts-1-hd
  ttsVoice: "shimmer", // alloy, echo, fable, onyx, nova, and shimmer
  chunkType: "sentence",
} as const;

export const MARKETING_NAME = "Aloud";
export const MARKETING_NAME_LONG = "Aloud: text to speech";

import { action, observable } from "mobx";
import { OpenAIAPIError, listModels } from "./openai";
import { debounce } from "obsidian";

export interface TTSPluginSettingsStore {
  settings: TTSPluginSettings;
  apiKeyValid?: boolean;
  apiKeyError?: string;
  checkApiKey: () => void;
  updateSettings: (settings: Partial<TTSPluginSettings>) => Promise<void>;
}

export async function pluginSettingsStore(
  loadData: () => Promise<unknown>,
  saveData: (data: unknown) => Promise<void>,
): Promise<TTSPluginSettingsStore> {
  const store = observable(
    {
      settings: ((await loadData()) as undefined | TTSPluginSettings) || {
        ...DEFAULT_SETTINGS,
      },
      apiKeyValid: undefined,
      apiKeyError: undefined,
      setApiKeyValidity(valid?: boolean, error?: string) {
        this.apiKeyValid = valid;
        this.apiKeyError = error;
      },
      checkApiKey: debounce(async () => {
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
            if (ex instanceof OpenAIAPIError) {
              if (ex.errorCode() === "invalid_api_key") {
                message =
                  "Invalid API key! Enter a valid API key in the plugin settings";
              } else {
                const msg = ex.jsonMessage();
                if (msg) {
                  message = msg;
                }
              }
            }
            store.setApiKeyValidity(false, message);
          }
        }
      }, 500),
      async updateSettings(update: Partial<TTSPluginSettings>) {
        const before = this.settings.OPENAI_API_KEY;
        Object.assign(this.settings, update);
        if (before !== this.settings.OPENAI_API_KEY) {
          await this.checkApiKey();
        }
        await saveData(this.settings);
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
