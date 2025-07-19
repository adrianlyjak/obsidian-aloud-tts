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

  it("should migrate data (openai base url) to version 1 format", async () => {
    const baseData = {
      API_KEY: "test-key",
      API_URL: OPENAI_API_URL,
      model: "test-model",
      ttsVoice: "test-voice",
      contextMode: false,
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...baseData,
      modelProvider: "openai",
      openai_apiKey: baseData.API_KEY,
      openai_ttsModel: baseData.model,
      openai_ttsVoice: baseData.ttsVoice,
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
      contextMode: false,
    };
    const loadData = async () => baseData;
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    const expectedSettings: TTSPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...baseData,
      modelProvider: "openaicompat",
      openaicompat_apiKey: baseData.API_KEY,
      openaicompat_apiBase: baseData.API_URL,
      openaicompat_ttsModel: baseData.model,
      openaicompat_ttsVoice: baseData.ttsVoice,
      contextMode: baseData.contextMode,
      version: 1,
    };

    expect(store.settings).toMatchObject(expectedSettings);
  });

  it("should apply gemini related settings to the default scope when original model provider was hume", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "hume",
      hume_apiKey: "test-key",
      hume_ttsVoice: "test-voice",
      hume_sourceType: "TEST_SOURCE",
      hume_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("gemini", {
      gemini_apiKey: "new-test-key",
      gemini_ttsModel: "new-test-model",
      gemini_ttsVoice: "new-test-voice",
      gemini_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.model).toEqual("new-test-model");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply gemini related settings to the default scope when original model provider was openai", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      openai_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("gemini", {
      gemini_apiKey: "new-test-key",
      gemini_ttsModel: "new-test-model",
      gemini_ttsVoice: "new-test-voice",
      gemini_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.model).toEqual("new-test-model");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply gemini related settings to the default scope when original model provider was openaicompat", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openaicompat",
      openaicompat_apiKey: "test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "test-model",
      openaicompat_ttsVoice: "test-voice",
      openaicompat_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("gemini", {
      gemini_apiKey: "new-test-key",
      gemini_ttsModel: "new-test-model",
      gemini_ttsVoice: "new-test-voice",
      gemini_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.model).toEqual("new-test-model");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply hume related settings to the default scope when original model provider was gemini", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "gemini",
      gemini_apiKey: "test-key",
      gemini_ttsModel: "test-model",
      gemini_ttsVoice: "test-voice",
      gemini_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("hume", {
      hume_apiKey: "new-test-key",
      hume_ttsVoice: "new-test-voice",
      hume_sourceType: "NEW_TEST_SOURCE",
      hume_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.sourceType).toEqual("NEW_TEST_SOURCE");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply hume related settings to the default scope when original model provider was openai", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      openai_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("hume", {
      hume_apiKey: "new-test-key",
      hume_ttsVoice: "new-test-voice",
      hume_sourceType: "NEW_TEST_SOURCE",
      hume_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.sourceType).toEqual("NEW_TEST_SOURCE");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply hume related settings to the default scope when original model provider was openaicompat", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openaicompat",
      openaicompat_apiKey: "test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "test-model",
      openaicompat_ttsVoice: "test-voice",
      openaicompat_contextMode: false,
    });
    const saveData = async (data: unknown) => {};

    const store = await pluginSettingsStore(loadData, saveData);

    await store.updateModelSpecificSettings("hume", {
      hume_apiKey: "new-test-key",
      hume_ttsVoice: "new-test-voice",
      hume_sourceType: "NEW_TEST_SOURCE",
      hume_contextMode: false,
    });
    expect(store.settings.API_KEY).toEqual("new-test-key");
    expect(store.settings.ttsVoice).toEqual("new-test-voice");
    expect(store.settings.sourceType).toEqual("NEW_TEST_SOURCE");
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openai related settings to the default scope when original model provider was gemini", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "gemini",
      gemini_apiKey: "test-key",
      gemini_ttsModel: "test-model",
      gemini_ttsVoice: "test-voice",
      gemini_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openai related settings to the default scope when original model provider was hume", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "hume",
      hume_apiKey: "test-key",
      hume_ttsVoice: "test-voice",
      hume_sourceType: "TEST_SOURCE",
      hume_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openai related settings to the default scope when original model provider was openaicompat", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openaicompat",
      openaicompat_apiKey: "test-key",
      openaicompat_apiBase: "https://api.example.com",
      openaicompat_ttsModel: "test-model",
      openaicompat_ttsVoice: "test-voice",
      openaicompat_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openaicompat related settings to the default scope when original model provider was gemini", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "gemini",
      gemini_apiKey: "test-key",
      gemini_ttsModel: "test-model",
      gemini_ttsVoice: "test-voice",
      gemini_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openaicompat related settings to the default scope when original model provider was hume", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "hume",
      hume_apiKey: "test-key",
      hume_ttsVoice: "test-voice",
      hume_sourceType: "TEST_SOURCE",
      hume_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
  });
  it("should apply openaicompat related settings to the default scope when original model provider was openai", async () => {
    const loadData = async () => ({
      ...DEFAULT_SETTINGS,
      modelProvider: "openai",
      openai_apiKey: "test-key",
      openai_ttsModel: "test-model",
      openai_ttsVoice: "test-voice",
      openai_contextMode: false,
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
    expect(store.settings.contextMode).toEqual(false);
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
