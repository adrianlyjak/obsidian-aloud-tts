import { hashStrings } from "../util/Minhash";
import { TTSModelOptions } from "../models/tts-model";
import { voiceHash } from "./TTSPluginSettings";

export interface AudioCache {
  getAudio(
    text: string,
    settings: TTSModelOptions,
  ): Promise<ArrayBuffer | null>;
  saveAudio(
    text: string,
    settings: TTSModelOptions,
    audio: ArrayBuffer,
  ): Promise<void>;
  expire(ageInMillis: number): Promise<void>;

  /** Get's the cache's usage in bytes */
  getStorageSize(): Promise<number>;
}

export function hashAudioInputs(
  text: string,
  settings: TTSModelOptions,
): string {
  return hashStrings([voiceHash(settings) + text])[0].toString();
}

export function memoryStorage(): AudioCache {
  const audios: Record<string, ArrayBuffer> = {};

  return {
    async getAudio(
      text: string,
      settings: TTSModelOptions,
    ): Promise<ArrayBuffer | null> {
      return audios[hashAudioInputs(text, settings)] || null;
    },
    async saveAudio(
      text: string,
      settings: TTSModelOptions,
      audio: ArrayBuffer,
    ): Promise<void> {
      audios[hashAudioInputs(text, settings)] = audio;
    },
    async expire(ageInMillis: number): Promise<void> {
      // meh
    },

    async getStorageSize(): Promise<number> {
      return Object.values(audios)
        .map((x) => x.byteLength)
        .reduce((a, b) => a + b, 0);
    },
  };
}
