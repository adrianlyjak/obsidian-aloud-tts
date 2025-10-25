import { vi } from "vitest";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import {
  TTSPluginSettingsStore,
  pluginSettingsStore,
  DEFAULT_SETTINGS,
} from "../player/TTSPluginSettings";
import { createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import { memoryStorage } from "../player/AudioCache";
import { AudioSink, TrackStatus } from "../player/AudioSink";
import { TTSModel, TTSModelOptions, AudioData } from "../models/tts-model";
import * as mobx from "mobx";

// Common test constants
export const emptyAudioBuffer = {
  length: 0,
  duration: 0,
  numberOfChannels: 0,
  sampleRate: 144000,
} as AudioBuffer;

// Create a fake HTML audio element for testing
export function FakeHTMLAudioElement() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
    seeking: false,
  };
}

// Consolidated FakeAudioSink class for testing
export class FakeAudioSink implements AudioSink {
  currentData: ArrayBuffer | undefined = undefined;
  isPlaying: boolean = false;
  isComplete: boolean = false;
  getAudioBuffer: (ab: ArrayBuffer) => Promise<AudioBuffer>;
  audios: ArrayBuffer[] = [];
  audio = FakeHTMLAudioElement() as any;

  constructor({
    getAudioBuffer = () => Promise.resolve(emptyAudioBuffer),
  }: {
    getAudioBuffer?: (ab: ArrayBuffer) => Promise<AudioBuffer>;
  } = {}) {
    this.getAudioBuffer = getAudioBuffer;
    mobx.makeObservable(this, {
      currentData: mobx.observable,
      isPlaying: mobx.observable,
      currentTime: mobx.observable,
      isComplete: mobx.observable,
      switchMedia: mobx.action,
      play: mobx.action,
      pause: mobx.action,
      setComplete: mobx.action,
      trackStatus: mobx.computed,
    });
  }

  currentTime: number = 0;

  mediaComplete(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  setComplete(): void {
    this.isComplete = true;
  }

  async switchMedia(data: ArrayBuffer): Promise<void> {
    const wasComplete = this.isPlaying && this.isComplete;
    this.isComplete = false;
    this.currentData = data;
    if (wasComplete) {
      this.play();
    }
  }

  async appendMedia(data: ArrayBuffer): Promise<void> {
    this.audios.push(data);
  }

  setRate(rate: number): void {}

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  async stop(): Promise<void> {
    this.isPlaying = false;
    this.isComplete = false;
    this.currentTime = 0;
  }

  async restart(): Promise<void> {}

  async clearMedia(): Promise<void> {
    this.currentTime = 0;
    this.audios = [];
  }

  get trackStatus(): TrackStatus {
    if (this.isComplete) return "complete";
    if (this.isPlaying) return "playing";
    return "paused";
  }

  source: AudioNode | undefined;
  context: AudioContext | undefined;
}

export function createTestModel(): TTSModel {
  return {
    call: async (txt: string, _: TTSModelOptions): Promise<AudioData> => ({
      data: new ArrayBuffer(txt.length),
      format: "mp3",
    }),
    validateConnection: async () => undefined,
    convertToOptions: () => ({ model: "fake" }),
  };
}

export function createTestAudioStore(): AudioStore {
  const system = createAudioSystem({
    storage: () => memoryStorage(),
    audioSink: () => new FakeAudioSink(),
    ttsModel: () => createTestModel(),
    settings: () => DEFAULT_SETTINGS,
    config: () => ({ backgroundLoaderIntervalMillis: 10 }),
    audioStore: (sys) => loadAudioStore({ system: sys }),
    chunkLoader: (sys) => new ChunkLoader({ system: sys }),
  });
  return system.audioStore;
}

export async function createTestSettingsStore(): Promise<TTSPluginSettingsStore> {
  return await pluginSettingsStore(
    async () => ({}),
    async () => {},
  );
}

// Mock factories
export const createMockAudioElement = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  currentTime: 0,
  play: vi.fn(),
  pause: vi.fn(),
});

export const createMockAudioBuffer = () => ({
  length: 1024,
  sampleRate: 44100,
  numberOfChannels: 2,
  duration: 1.0,
  getChannelData: vi.fn().mockReturnValue(new Float32Array(1024)),
});

export const createMockObsidianBridge = () => ({
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
