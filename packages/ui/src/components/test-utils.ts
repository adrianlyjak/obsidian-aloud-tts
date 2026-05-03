import { vi } from "vitest";
export {
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
} from "../../../open-tts/src/test-utils";

export const createMockAudioElement = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  currentTime: 0,
  play: vi.fn(),
  pause: vi.fn(),
});

export const createMockDecodedAudioData = () => ({
  length: 1024,
  sampleRate: 44100,
  numberOfChannels: 2,
  duration: 1.0,
  getChannelData: vi.fn().mockReturnValue(new Float32Array(1024)),
});

export const createMockEditorBridge = () => ({
  activeEditor: {
    state: { doc: { toString: () => "test content" } },
    dispatch: vi.fn(),
  },
  focusedEditor: {
    state: { doc: { toString: () => "test content" } },
    dispatch: vi.fn(),
  },
  detachedAudio: false,
  setActiveEditor: vi.fn(),
  isMobile: vi.fn(() => false),
});

export const createMockEditorView = () => ({
  state: { doc: { toString: () => "test content" } },
  dispatch: vi.fn(),
});
