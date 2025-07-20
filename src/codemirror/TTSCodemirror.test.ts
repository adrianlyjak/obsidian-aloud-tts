import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TTSCodeMirror } from "./TTSCodemirror";
import { createTestAudioStore, createTestSettingsStore, FakeAudioSink, createMockObsidianBridge } from "../components/test-utils";

// Mock React and DOM utilities
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("../components/PlayerView", () => ({
  PlayerView: () => null,
}));

vi.mock("../components/DownloadProgress", () => ({
  createDOM: vi.fn(() => document.createElement("div")),
}));

describe("TTSCodemirror", () => {
  it("should create extension without crashing", async () => {
    const mockAudioStore = createTestAudioStore();
    const mockSettings = await createTestSettingsStore();
    const mockSink = new FakeAudioSink();
    const mockBridge = createMockObsidianBridge();

    const extension = TTSCodeMirror(
      mockAudioStore,
      mockSettings,
      mockSink,
      mockBridge as any
    );

    expect(extension).toBeDefined();
    expect(Array.isArray(extension)).toBe(true);
  });

  it("should work with EditorView", async () => {
    const mockAudioStore = createTestAudioStore();
    const mockSettings = await createTestSettingsStore();
    const mockSink = new FakeAudioSink();
    const mockBridge = createMockObsidianBridge();

    const extension = TTSCodeMirror(
      mockAudioStore,
      mockSettings,
      mockSink,
      mockBridge as any
    );

    // Create a minimal editor state with the extension
    const state = EditorState.create({
      doc: "Hello world",
      extensions: extension,
    });

    // Just verify the state was created successfully
    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe("Hello world");
  });
}); 