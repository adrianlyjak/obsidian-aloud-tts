import { hashString } from "../util/Minhash";
import { AudioData, MediaFormat, TTSModelOptions } from "../models/tts-model";
import { voiceHash } from "./TTSPluginSettings";

export interface AudioCache {
  getAudio(
    text: string,
    settings: TTSModelOptions,
    format: MediaFormat,
  ): Promise<AudioData | null>;
  saveAudio(
    text: string,
    settings: TTSModelOptions,
    audio: AudioData,
  ): Promise<void>;
  expire(ageInMillis: number): Promise<void>;

  /** Get's the cache's usage in bytes */
  getStorageSize(): Promise<number>;
}

export function hashAudioInputs(
  text: string,
  settings: TTSModelOptions,
  format: MediaFormat,
): string {
  return hashString(`${voiceHash(settings)}|${format}|${text}`, 64).toString(
    16,
  );
}

export function memoryStorage(): AudioCache {
  const audios: Record<string, AudioData> = {};

  return {
    async getAudio(
      text: string,
      settings: TTSModelOptions,
      format: MediaFormat,
    ): Promise<AudioData | null> {
      return audios[hashAudioInputs(text, settings, format)] || null;
    },
    async saveAudio(
      text: string,
      settings: TTSModelOptions,
      audio: AudioData,
    ): Promise<void> {
      audios[hashAudioInputs(text, settings, audio.format)] = audio;
    },
    async expire(ageInMillis: number): Promise<void> {
      // meh
    },

    async getStorageSize(): Promise<number> {
      return Object.values(audios)
        .map((x) => x.data.byteLength)
        .reduce((a, b) => a + b, 0);
    },
  };
}
