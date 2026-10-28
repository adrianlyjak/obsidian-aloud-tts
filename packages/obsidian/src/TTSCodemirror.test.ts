import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TTSCodeMirror } from "./TTSCodemirror";
import {
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
  createMockObsidianBridge,
} from "./test-utils";

// Mock React and DOM utilities
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("@open-tts/ui", () => ({
  PlayerView: () => null,
  createDOM: vi.fn(() => document.createElement("div")),
  destroyDOM: vi.fn(),
  createLoadingSpinnerExtension: vi.fn(() => []),
  createTTSHighlightExtension: vi.fn(() => []),
  ObsidianLoadingWidgetFactory: vi.fn(),
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
      mockBridge as any,
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
      mockBridge as any,
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

  it("marks toolbar clicks as handled so hover popovers stay open", async () => {
    const extension = TTSCodeMirror(
      createTestAudioStore(),
      await createTestSettingsStore(),
      new FakeAudioSink(),
      createMockObsidianBridge() as any,
    );
    const view = new EditorView({
      state: EditorState.create({ doc: "Hello world", extensions: extension }),
      parent: document.body,
    });
    const button = document.createElement("button");
    view.dom.querySelector(".tts-toolbar")!.appendChild(button);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    view.destroy();
  });
});
