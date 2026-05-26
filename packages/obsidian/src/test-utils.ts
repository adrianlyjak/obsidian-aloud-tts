import { vi } from "vitest";

export {
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
} from "../../open-tts/src/test-utils";

export const createMockEditorView = () => ({
  state: { doc: { toString: () => "test content" } },
  dispatch: vi.fn(),
});

export const createMockObsidianBridge = () => ({
  activeEditor: undefined,
  focusedEditor: undefined,
  activeObsidianEditor: undefined,
  canPlayDetachedAudio: false,
  detachedAudio: false,
  triggerSelection: vi.fn(),
  playSelection: vi.fn(),
  playDetached: vi.fn(),
  playClipboard: vi.fn(),
  onTextChanged: vi.fn(),
  openSettings: vi.fn(),
  destroy: vi.fn(),
  isMobile: vi.fn(() => false),
  exportAudio: vi.fn(),
  saveDocumentAudio: vi.fn(),
});
