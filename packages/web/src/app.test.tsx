import { describe, it, expect, vi } from "vitest";

// Mock all the dependencies
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("open-tts", () => ({
  loadAudioStore: vi.fn(() => ({})),
  pluginSettingsStore: vi.fn(() =>
    Promise.resolve({
      settings: { modelProvider: "openai" },
    }),
  ),
  MARKETING_NAME_LONG: "Aloud: text to speech",
  createAudioSystem: vi.fn(() => ({
    settings: { modelProvider: "openai" },
    audioStore: {},
  })),
  ChunkLoader: vi.fn(),
  REGISTRY: {
    openai: {},
  },
}));

vi.mock("open-tts/browser", () => ({
  IndexedDBAudioStorage: vi.fn(),
  WebAudioSink: {
    create: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock("@open-tts/ui", () => ({
  AudioVisualizer: () => null,
  TooltipProvider: ({ children }: { children: unknown }) => children,
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
