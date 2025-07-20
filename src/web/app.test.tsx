import { describe, it, expect, vi } from "vitest";

// Mock all the dependencies
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("../player/AudioStore", () => ({
  loadAudioStore: vi.fn(() => ({})),
}));

vi.mock("../player/TTSPluginSettings", () => ({
  pluginSettingsStore: vi.fn(() =>
    Promise.resolve({
      settings: { modelProvider: "openai" },
    }),
  ),
}));

vi.mock("./IndexedDBAudioStorage", () => ({
  IndexedDBAudioStorage: vi.fn(),
}));

vi.mock("../player/AudioSink", () => ({
  WebAudioSink: {
    create: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock("../player/AudioSystem", () => ({
  createAudioSystem: vi.fn(() => ({
    settings: { modelProvider: "openai" },
    audioStore: {},
  })),
}));

vi.mock("../player/ChunkLoader", () => ({
  ChunkLoader: vi.fn(),
}));

vi.mock("../models/registry", () => ({
  REGISTRY: {
    openai: {},
  },
}));

vi.mock("../components/AudioVisualizer", () => ({
  AudioVisualizer: () => null,
}));

// Mock localStorage
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  },
  writable: true,
});

describe("Web App", () => {
  it("should import without crashing", async () => {
    // Just importing the module should not crash
    const appModule = await import("./app");
    expect(appModule).toBeDefined();
  });

  it("should have localStorage mocked for testing", () => {
    expect(window.localStorage.getItem).toBeDefined();
    expect(window.localStorage.setItem).toBeDefined();
  });
});
