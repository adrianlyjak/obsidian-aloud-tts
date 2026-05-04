import * as mobx from "mobx";
import { AudioStore, loadAudioStore } from "./player/AudioStore";
import {
  DEFAULT_SETTINGS,
  TTSPluginSettingsStore,
  pluginSettingsStore,
} from "./player/TTSPluginSettings";
import { createAudioSystem } from "./player/AudioSystem";
import { ChunkLoader } from "./player/ChunkLoader";
import { memoryStorage } from "./player/AudioCache";
import { AudioSink, DecodedAudioData, TrackStatus } from "./player/AudioSink";
import { AudioData, TTSModel, TTSModelOptions } from "./models/tts-model";
import { CancellablePromise } from "./player/CancellablePromise";

export const emptyDecodedAudioData: DecodedAudioData = {
  length: 0,
  duration: 0,
  numberOfChannels: 0,
  sampleRate: 144000,
  getChannelData: () => new Float32Array(0),
};

export class FakeAudioSink implements AudioSink {
  currentData: ArrayBuffer | undefined = undefined;
  isPlaying = false;
  isComplete = false;
  audios: ArrayBuffer[] = [];
  currentTime = 0;
  bufferedStart: number | undefined = undefined;
  decodeAudioData: (ab: ArrayBuffer) => Promise<DecodedAudioData>;

  constructor({
    decodeAudioData = () => Promise.resolve(emptyDecodedAudioData),
  }: {
    decodeAudioData?: (ab: ArrayBuffer) => Promise<DecodedAudioData>;
  } = {}) {
    this.decodeAudioData = decodeAudioData;
    mobx.makeObservable(this, {
      currentData: mobx.observable,
      isPlaying: mobx.observable,
      currentTime: mobx.observable,
      isComplete: mobx.observable,
      bufferedStart: mobx.observable,
      switchMedia: mobx.action,
      play: mobx.action,
      pause: mobx.action,
      setComplete: mobx.action,
      trackStatus: mobx.computed,
    });
  }

  mediaComplete(): Promise<void> {
    this.isPlaying = false;
    this.isComplete = true;
    return Promise.resolve();
  }

  waitForSeeking(): CancellablePromise<void> {
    return CancellablePromise.cancelFn(new Promise<void>(() => {}), () => {});
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

  setRate(_rate: number): void {}

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
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

  destroy(): void {}
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
