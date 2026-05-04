import { describe, it, expect, vi } from "vitest";
import {
  pluginSettingsStore,
  DEFAULT_SETTINGS,
  TTSPluginSettings,
} from "./TTSPluginSettings";
import { OPENAI_API_URL } from "../models/openai";

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

  it("should migrate data (no base url) from version 0 format", async () => {
    const baseData = {
      OPENAI_API_KEY: "test-key",
      OPENAI_API_URL: "",
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      version: 2,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });

  it("should migrate data (openai base url) to from version 0 format", async () => {
    const baseData = {
      OPENAI_API_KEY: "test-key",
      OPENAI_API_URL: OPENAI_API_URL,
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: baseData.OPENAI_API_KEY,
      openai_ttsModel: baseData.model,
      openai_ttsVoice: baseData.ttsVoice,
      version: 2,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });
  it("should migrate data (custom base url) from version 0 format", async () => {
    const baseData = {
      OPENAI_API_KEY: "test-key",
      OPENAI_API_URL: "https://api.example.com",
      model: "test-model",
      ttsVoice: "test-voice",
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      modelProvider: "openaicompat",
      openaicompat_apiKey: baseData.OPENAI_API_KEY,
      openaicompat_apiBase: baseData.OPENAI_API_URL,
      openaicompat_ttsModel: baseData.model,
      openaicompat_ttsVoice: baseData.ttsVoice,
      version: 2,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });

  it("should migrate v1 to v2 format by removing shared fields and preserving provider-specific settings", async () => {
    const v1Data = {
      version: 1,
      modelProvider: "openai",
      // Legacy shared fields that should be removed
      OPENAI_API_KEY: "legacy-key",
      OPENAI_API_URL: "legacy-url",
      model: "legacy-model",
      ttsVoice: "legacy-voice",
      instructions: "legacy-instructions",
      // Provider-specific fields that should be preserved
      openai_apiKey: "correct-key",
      openai_ttsModel: "correct-model",
      openai_ttsVoice: "correct-voice",
      gemini_apiKey: "gemini-key",
      gemini_ttsModel: "gemini-model",
      // Other settings
      chunkType: "paragraph",
      playbackSpeed: 1.5,
    };
    const loadData = async () => v1Data;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    // Should have v2 structure without legacy shared fields
    expect(store.settings.version).toBe(2);
    expect(store.settings).not.toHaveProperty("OPENAI_API_KEY");
    expect(store.settings).not.toHaveProperty("OPENAI_API_URL");
    expect(store.settings).not.toHaveProperty("model");
    expect(store.settings).not.toHaveProperty("ttsVoice");
    expect(store.settings).not.toHaveProperty("instructions");

    // Should preserve provider-specific settings
    expect(store.settings.openai_apiKey).toBe("correct-key");
    expect(store.settings.openai_ttsModel).toBe("correct-model");
    expect(store.settings.openai_ttsVoice).toBe("correct-voice");
    expect(store.settings.gemini_apiKey).toBe("gemini-key");
    expect(store.settings.gemini_ttsModel).toBe("gemini-model");

    // Should preserve other settings
    expect(store.settings.modelProvider).toBe("openai");
    expect(store.settings.chunkType).toBe("paragraph");
    expect(store.settings.playbackSpeed).toBe(1.5);

    // Should have default values for any missing fields
    expect(store.settings.gemini_ttsVoice).toBe(
      DEFAULT_SETTINGS.gemini_ttsVoice,
    );
    expect(store.settings.hume_apiKey).toBe(DEFAULT_SETTINGS.hume_apiKey);
  });

  it("should update model provider and merge settings when using updateModelSpecificSettings", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("gemini", {
      gemini_apiKey: "new-key",
      gemini_ttsModel: "new-model",
      gemini_ttsVoice: "new-voice",
    });

    expect(store.settings.modelProvider).toEqual("gemini");
    expect(store.settings.gemini_apiKey).toEqual("new-key");
    expect(store.settings.gemini_ttsModel).toEqual("new-model");
    expect(store.settings.gemini_ttsVoice).toEqual("new-voice");
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
