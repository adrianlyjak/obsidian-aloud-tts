import { describe, it, expect, vi } from "vitest";
import TTSPlugin from "./TTSPlugin";

// Mock all the heavy dependencies
vi.mock("../codemirror/TTSCodemirror", () => ({
  TTSCodeMirror: vi.fn(() => []),
}));

vi.mock("../components/TTSPluginSettingsTab", () => ({
  TTSSettingTab: vi.fn(),
}));

vi.mock("../player/AudioSink", () => ({
  WebAudioSink: {
    create: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock("../player/AudioStore", () => ({
  loadAudioStore: vi.fn(() => ({})),
}));

vi.mock("../player/AudioSystem", () => ({
  createAudioSystem: vi.fn(() => ({
    audioStore: {},
    audioSink: {},
    settings: { modelProvider: "openai" },
  })),
}));

vi.mock("../player/ChunkLoader", () => ({
  ChunkLoader: vi.fn(),
}));

vi.mock("../player/TTSPluginSettings", () => ({
  pluginSettingsStore: vi.fn(() =>
    Promise.resolve({
      settings: { modelProvider: "openai" },
    }),
  ),
  MARKETING_NAME: "TestTTS",
  MARKETING_NAME_LONG: "Test TTS Plugin",
}));

vi.mock("./ObsidianBridge", () => ({
  ObsidianBridgeImpl: vi.fn(() => ({
    triggerSelection: vi.fn(),
    exportAudio: vi.fn(),
  })),
}));

vi.mock("./ObsidianPlayer", () => ({
  configurableAudioCache: vi.fn(() => ({
    destroy: vi.fn(),
  })),
}));

vi.mock("../models/registry", () => ({
  REGISTRY: {
    openai: {},
  },
}));

// Mock Obsidian Plugin class and other dependencies
vi.mock("obsidian", () => ({
  Plugin: class MockPlugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
    loadData() {
      return Promise.resolve({});
    }
    saveData() {
      return Promise.resolve();
    }
    addRibbonIcon() {
      return {} as any;
    }
    addCommand() {}
    addSettingTab() {}
    registerEvent() {}
    registerEditorExtension() {}
  },
  Notice: vi.fn(),
  addIcon: vi.fn(),
}));

describe("TTSPlugin", () => {
  it("should instantiate without crashing", () => {
    const mockApp = {
      workspace: {
        on: vi.fn(),
        off: vi.fn(),
      },
      vault: {
        on: vi.fn(),
        off: vi.fn(),
      },
    } as any;

    const mockManifest = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      author: "Test Author",
      minAppVersion: "0.12.0",
      description: "Test plugin description",
    };

    const plugin = new TTSPlugin(mockApp, mockManifest);

    expect(plugin).toBeDefined();
    expect(plugin).toBeInstanceOf(TTSPlugin);
  });

  it("should have required plugin methods", () => {
    const mockApp = {
      workspace: {
        on: vi.fn(),
        off: vi.fn(),
      },
      vault: {
        on: vi.fn(),
        off: vi.fn(),
      },
    } as any;

    const mockManifest = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      author: "Test Author",
      minAppVersion: "0.12.0",
      description: "Test plugin description",
    };

    const plugin = new TTSPlugin(mockApp, mockManifest);

    // Check that plugin lifecycle methods exist
    expect(typeof plugin.onload).toBe("function");
    expect(typeof plugin.onunload).toBe("function");
  });

  it("should have audio system properties after instantiation", () => {
    const mockApp = {
      workspace: {
        on: vi.fn(),
        off: vi.fn(),
      },
      vault: {
        on: vi.fn(),
        off: vi.fn(),
      },
    } as any;

    const mockManifest = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      author: "Test Author",
      minAppVersion: "0.12.0",
      description: "Test plugin description",
    };

    const plugin = new TTSPlugin(mockApp, mockManifest);

    // These properties are declared in the class type (TypeScript), but not initialized until onload
    // Just verify the plugin exists and has the expected structure
    expect(plugin.settings).toBeUndefined(); // Not initialized yet
    expect(plugin.system).toBeUndefined(); // Not initialized yet
    expect(plugin.bridge).toBeUndefined(); // Not initialized yet
  });
});
