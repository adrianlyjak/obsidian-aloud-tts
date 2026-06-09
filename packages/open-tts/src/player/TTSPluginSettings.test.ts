import { describe, it, expect, vi } from "vitest";
import {
  pluginSettingsStore,
  DEFAULT_SETTINGS,
  TTSPluginSettings,
} from "./TTSPluginSettings";
import { OPENAI_API_URL } from "../models/openai";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  debounce: () => vi.fn(),
}));

describe("pluginSettingsStore", () => {
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
      version: 3,
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
      version: 3,
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
      version: 3,
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

    // Should have v3 structure without legacy shared fields
    expect(store.settings.version).toBe(3);
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

  it("backfills docSwitchBehavior when upgrading from v2 settings that predate the field", async () => {
    // Simulate an older v2 save that had no docSwitchBehavior key at all
    const { docSwitchBehavior: _omit, ...oldFields } = DEFAULT_SETTINGS;
    const v2DataWithoutDocSwitch = { ...oldFields, version: 2 };
    const loadData = async () => v2DataWithoutDocSwitch;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.docSwitchBehavior).toBe("continue");
  });

  it("backfills Chatterbox fields with defaults when upgrading from pre-chatterbox v2 settings", async () => {
    const oldV2 = {
      version: 2,
      modelProvider: "openai",
      openai_apiKey: "key",
    };
    const loadData = async () => oldV2;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.chatterbox_apiBase).toBe("http://localhost:4123");
    expect(store.settings.chatterbox_exaggeration).toBe(0.45);
    expect(store.settings.chatterbox_cfgWeight).toBe(0.65);
    expect(store.settings.chatterbox_temperature).toBe(1.0);
    expect(store.settings.chatterbox_batchMode).toBe(true);
    expect(store.settings.audioFolder).toBe("_audio");
  });

  it("backfills Fish batch-mode fields with defaults when upgrading", async () => {
    const oldV2 = { version: 2, modelProvider: "fish", fish_apiKey: "key" };
    const loadData = async () => oldV2;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.fish_batchMode).toBe(true);
    expect(store.settings.audioFolder).toBe("_audio");
  });

  it("backfills MiniMax batch-mode fields with defaults when upgrading", async () => {
    const oldV2 = {
      version: 2,
      modelProvider: "minimax",
      minimax_apiKey: "key",
    };
    const loadData = async () => oldV2;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.minimax_batchMode).toBe(true);
    expect(store.settings.audioFolder).toBe("_audio");
  });

  it("migrates custom per-provider audioFolder to unified audioFolder on upgrade to v3", async () => {
    const oldV2 = {
      version: 2,
      modelProvider: "fish",
      fish_apiKey: "key",
      fish_audioFolder: "my-custom-audio",
    };
    const loadData = async () => oldV2;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.audioFolder).toBe("my-custom-audio");
  });

  it("falls back to chatterbox when a removed provider appears in persisted settings", async () => {
    const dataWithRemovedProvider = {
      version: 2,
      modelProvider: "xtts", // removed provider
    };
    const loadData = async () => dataWithRemovedProvider;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.modelProvider).toBe("chatterbox");
  });

  it("preserves docSwitchBehavior when already set", async () => {
    const data = { ...DEFAULT_SETTINGS, docSwitchBehavior: "stop" as const };
    const loadData = async () => data;
    const store = await pluginSettingsStore(loadData, async () => {});

    expect(store.settings.docSwitchBehavior).toBe("stop");
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
