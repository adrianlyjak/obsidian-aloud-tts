export interface TTSPluginSettings {
  OPENAI_API_KEY: string;
  OPENAI_API_URL: string;
  model: string;
  ttsVoice: string;
  chunkType: "sentence" | "paragraph";
  playbackSpeed: number;
}

export const DEFAULT_SETTINGS: TTSPluginSettings = {
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com",
  model: "tts-1", // tts-1-hd
  ttsVoice: "shimmer", // alloy, echo, fable, onyx, nova, and shimmer
  chunkType: "sentence",
  playbackSpeed: 1.0,
} as const;

/** interface is easier if its just some canned speeds */
export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function nextSpeed(current: number): number {
  return PLAYBACK_SPEEDS[
    (PLAYBACK_SPEEDS.indexOf(current) + 1) % PLAYBACK_SPEEDS.length
  ];
}

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
  changeSpeed(): void;
}

export async function pluginSettingsStore(
  loadData: () => Promise<unknown>,
  saveData: (data: unknown) => Promise<void>,
): Promise<TTSPluginSettingsStore> {
  const store = observable(
    {
      settings: {
        ...DEFAULT_SETTINGS,
        ...((await loadData()) as undefined | TTSPluginSettings),
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
      updateSettings: async (
        update: Partial<TTSPluginSettings>,
      ): Promise<void> => {
        const before = store.settings.OPENAI_API_KEY;
        Object.assign(store.settings, update);
        if (before !== store.settings.OPENAI_API_KEY) {
          await store.checkApiKey();
        }
        await saveData(store.settings);
      },
      changeSpeed: (): void => {
        store.updateSettings({
          playbackSpeed: nextSpeed(store.settings.playbackSpeed),
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
