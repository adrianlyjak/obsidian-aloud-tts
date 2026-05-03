import { AudioCache } from "./AudioCache";
import { AudioSink } from "./AudioSink";
import { AudioStore } from "./AudioStore";
import { TTSModel } from "../models/tts-model";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { ChunkLoader } from "./ChunkLoader";

// Configuration options for the AudioSystem
export interface AudioSystemConfig {
  backgroundLoaderIntervalMillis: number;
}

export interface AudioSystem {
  readonly audioSink: AudioSink;
  readonly audioStore: AudioStore;
  readonly settings: TTSPluginSettings;
  readonly storage: AudioCache;
  readonly chunkLoader: ChunkLoader;
  readonly ttsModel: TTSModel;
  readonly config: AudioSystemConfig;
}

// Define the AsLazyBuilder type
export type AsLazyBuilder<T> = {
  [K in keyof T]: (input: AudioSystem) => T[K];
};

// Define a type that makes all fields of a given type mutable
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

/** Poor Man's Dependency Injection via a global system */
export function createAudioSystem(
  opts: AsLazyBuilder<AudioSystem>,
): AudioSystem {
  const partial: Partial<Mutable<AudioSystem>> = {};
  const proxy = new Proxy(
    {},
    {
      get(_, prop: keyof AudioSystem) {
        if (!partial[prop]) {
          partial[prop] = opts[prop](proxy as AudioSystem) as any;
        }
        return partial[prop];
      },
    },
  );
  return proxy as AudioSystem;
}
