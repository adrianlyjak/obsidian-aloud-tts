import { AudioSystem } from "./AudioSystem";
import { splitSentences } from "../util/misc";
import { convertToPlayableFormat } from "../util/audioProcessing";
import { AudioData, TTSModelOptions } from "../models/tts-model";

export interface BatchProgress {
  current: number;
  total: number;
  text: string;
}

export interface BatchPlayerOptions {
  onProgress?: (progress: BatchProgress) => void;
  onComplete?: (audio: AudioData) => void;
  onError?: (error: Error) => void;
}

/**
 * Handles batch generation of audio for a full text,
 * showing progress and returning the final concatenated result.
 */
export class BatchPlayer {
  private system: AudioSystem;

  constructor(system: AudioSystem) {
    this.system = system;
  }

  async generate(
    text: string,
    options: TTSModelOptions,
    batchOptions: BatchPlayerOptions = {},
    signal?: AbortSignal,
  ): Promise<AudioData> {
    const chunks = splitSentences(text);
    const total = chunks.length;
    const audioBuffers: ArrayBuffer[] = [];

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new DOMException("Batch generation cancelled", "AbortError");
      }

      const chunk = chunks[i];
      if (batchOptions.onProgress) {
        batchOptions.onProgress({
          current: i + 1,
          total,
          text: chunk.trim(),
        });
      }

      try {
        const audio = await this.system.ttsModel.call(
          chunk,
          options,
          this.system.settings,
          {},
          signal,
        );
        const playable = await convertToPlayableFormat(audio);
        audioBuffers.push(playable.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        if (batchOptions.onError) {
          batchOptions.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        throw error;
      }
    }

    // Assemble MP3s
    const { concatenateMp3Buffers } = await import("../util/audioProcessing");

    const finalBuffer = await concatenateMp3Buffers(
      audioBuffers,
      this.system.audioSink,
    );
    const result: AudioData = { data: finalBuffer, format: "mp3" };

    if (batchOptions.onComplete) {
      batchOptions.onComplete(result);
    }

    return result;
  }
}
