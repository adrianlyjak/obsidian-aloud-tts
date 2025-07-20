import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TTSSettingsTabComponent } from "./TTSSettingsTabComponent";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import {
  TTSPluginSettingsStore,
  pluginSettingsStore,
  DEFAULT_SETTINGS,
  modelProviders,
} from "../player/TTSPluginSettings";
import { createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import { memoryStorage } from "../player/AudioCache";
import { AudioSink, TrackStatus } from "../player/AudioSink";
import { TTSModel, TTSModelOptions } from "../models/tts-model";
import * as mobx from "mobx";

// Mock components that have obsidian dependencies
vi.mock("./IconButton", () => ({
  IconButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  IconSpan: ({ children }: any) => <span>{children}</span>,
  Spinner: () => <div>Loading...</div>,
}));

vi.mock("./PlayerView", () => ({
  TTSErrorInfoView: () => <div>Error View</div>,
  TTSErrorInfoDetails: () => <div>Error Details</div>,
}));

// Create a fake audio element
function FakeHTMLAudioElement() {
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
  };
}

const emptyAudioBuffer = {
  length: 0,
  duration: 0,
  numberOfChannels: 0,
  sampleRate: 144000,
} as AudioBuffer;

// Create a fake audio sink for testing (based on AudioStore.test.ts)
class FakeAudioSink implements AudioSink {
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

  get trackStatus(): TrackStatus {
    if (this.isComplete) return "complete";
    if (this.isPlaying) return "playing";
    return "paused";
  }

  async restart(): Promise<void> {
    this.currentTime = 0;
    this.isComplete = false;
    if (this.isPlaying) {
      this.play();
    }
  }

  async clearMedia(): Promise<void> {
    this.currentData = undefined;
    this.audios = [];
    this.isComplete = false;
  }
}

// Create a fake TTS model for testing (based on AudioStore.test.ts)
function createModel(): TTSModel {
  return {
    call: async (txt: string, _: TTSModelOptions) => {
      return new ArrayBuffer(txt.length);
    },
    validateConnection: async () => undefined,
    convertToOptions: () => ({
      model: "fake",
      contextMode: false,
    }),
  };
}

// Helper to create test stores
async function createTestStores() {
  const audioStore = createAudioStore();
  const settingsStore = await createSettingsStore();
  return { audioStore, settingsStore };
}

function createAudioStore(): AudioStore {
  const system = createAudioSystem({
    storage: () => memoryStorage(),
    audioSink: () => new FakeAudioSink(),
    ttsModel: () => createModel(),
    settings: () => DEFAULT_SETTINGS,
    config: () => ({ backgroundLoaderIntervalMillis: 10 }),
    audioStore: (sys) => loadAudioStore({ system: sys }),
    chunkLoader: (sys) => new ChunkLoader({ system: sys }),
  });
  return system.audioStore;
}

async function createSettingsStore(): Promise<TTSPluginSettingsStore> {
  return await pluginSettingsStore(
    async () => ({}), // loadData
    async () => {}, // saveData
  );
}

describe("TTSPluginSettingsTab", () => {
  let stores: { audioStore: AudioStore; settingsStore: TTSPluginSettingsStore };

  beforeEach(async () => {
    stores = await createTestStores();
  });

  it("should render settings and switch between all providers", async () => {
    const user = userEvent.setup();

    render(
      <TTSSettingsTabComponent
        store={stores.settingsStore}
        player={stores.audioStore}
      />,
    );

    // Should render main elements
    expect(screen.getByText("Aloud")).toBeDefined();
    expect(screen.getByText("Model Provider")).toBeDefined();
    expect(screen.getByRole("button", { name: /test voice/i })).toBeDefined();

    // Switch through all providers to maximize coverage
    const select = screen.getByDisplayValue("OpenAI");

    for (const provider of modelProviders) {
      await user.selectOptions(select, provider);

      // Each provider switch should trigger the update function
      expect(stores.settingsStore.settings.modelProvider).toBe(provider);

      // Just verify the component rendered without crashing for this provider
      expect(screen.getByText("Model Provider")).toBeDefined();
    }
  });
});
