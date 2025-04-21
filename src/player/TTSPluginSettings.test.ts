import { describe, it, expect, vi } from "vitest";
import {
  pluginSettingsStore,
  DEFAULT_SETTINGS,
  TTSPluginSettings,
} from "./TTSPluginSettings";

describe("pluginSettingsStore", () => {
  vi.mock("obsidian", () => ({
    requestUrl: vi.fn(),
    debounce: () => vi.fn(),
  }));
  it("should load default settings when data is undefined", async () => {
    const loadData = async () => undefined;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("should migrate data (no base url) to version 1 format", async () => {
    const baseData = {
      API_KEY: "test-key",
      API_URL: "",
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...baseData,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      version: 1,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });
  it("should migrate data (default base url) to version 1 format", async () => {
    const baseData = {
      API_KEY: "test-key",
      API_URL: "https://api.openai.com",
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...baseData,
      API_URL: "https://api.openai.com",
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      version: 1,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });
  it("should migrate data (custom base url) to version 1 format", async () => {
    const baseData = {
      API_KEY: "test-key",
      API_URL: "https://api.example.com",
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...baseData,
      API_URL: "https://api.example.com",
      modelProvider: "openaicompat",
      openaicompat_apiKey: "test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "test-model",
      openaicompat_ttsVoice: "test-voice",
      version: 1,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });
  it("should migrate data (hume base url) to version 1 format", async () => {
    const baseData = {
      hume_apiKey: "test-key",
      hume_voice: "test-voice",
      hume_ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      modelProvider: "hume",
      hume_apiKey: "test-key",
      hume_ttsVoice: "test-voice",
    };
    expect(store.settings.hume_apiKey).toEqual(expectedSettings.hume_apiKey);
    expect(store.settings.hume_ttsVoice).toEqual(
      expectedSettings.hume_ttsVoice,
    );
    expect(store.settings.hume_ttsVoice).toEqual(expectedSettings.hume_ttsVoice);
    expect(store.settings).toMatchObject(expectedSettings);
  });

  it("should apply openai related settings to the default scope", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openaicompat",
      openaicompat_apiKey: "test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "test-model",
      openaicompat_ttsVoice: "test-voice",
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("openai", {
      openai_apiKey: "new-test-key",
      openai_ttsModel: "new-test-model",
      openai_ttsVoice: "new-test-voice",
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.model).toEqual("new-test-model");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
  });
  it("should apply openaicompat related settings to the default scope", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_apiBase: "https://api.example.com",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("openaicompat", {
      openaicompat_apiKey: "new-test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "new-test-model",
      openaicompat_ttsVoice: "new-test-voice",
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.API_URL).toEqual("https://api.example.com");
    expect(store.settings.model).toEqual("new-test-model");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
  });
  it("should save data when updateSettings is called", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
    });
    const mock = vi.fn().mockResolvedValue({});
    const store = await pluginSettingsStore(loadData, mock);

    await store.updateSettings({
      cacheType: "vault",
    });
    expect(mock).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      cacheType: "vault",
    });
    expect(store.settings.cacheType).toEqual("vault");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
