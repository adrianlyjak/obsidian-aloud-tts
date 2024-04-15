import { hashString } from "src/util/Minhash";
import { TTSModelOptions } from "./TTSModel";
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
  expire(): Promise<void>;
}

export function hashAudioInputs(
  text: string,
  settings: TTSModelOptions,
): string {
  return hashString(voiceHash(settings) + text).toString();
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
    async expire(): Promise<void> {
      // meh
    },
  };
}
