import * as mobx from "mobx";
import { AudioSystem } from "./AudioSystem";
import {
  AudioTextContext,
  TTSErrorInfo,
  TTSModelOptions,
} from "../models/tts-model";
import { AudioData } from "../models/tts-model";
import { convertToPlayableFormat } from "../util/audioProcessing";

/** manages loading and caching of tracks */
export class ChunkLoader {
  private MAX_BACKGROUND_REQUESTS = 3;
  private MAX_LOCAL_TTL_MILLIS = 60 * 1000;

  private system: AudioSystem;
  private backgroundQueue: BackgroundRequest[] = [];
  private backgroundActiveCount = 0;
  private localCache: CachedAudio[] = [];
  private backgroundRequestProcessor: IntervalDaemon;
  private garbageCollector: IntervalDaemon;

  constructor({ system }: { system: AudioSystem }) {
    this.system = system;

    this.backgroundRequestProcessor = IntervalDaemon(
      this.processBackgroundQueue.bind(this),
      { interval: system.config.backgroundLoaderIntervalMillis },
    );
    this.garbageCollector = IntervalDaemon(this.processGarbage.bind(this), {
      interval: this.MAX_LOCAL_TTL_MILLIS / 2,
    }).startIfNot();
  }

  expireBefore = (
    position: number = this.system.audioStore?.activeText?.position ?? 0,
  ): void => {
    this.backgroundQueue = this.backgroundQueue.filter(
      (x) => !(x.position < position),
    );
  };

  /**
   * Removes locally cached audio (e.g., if ArrayBuffer becomes detached).
   * Does not affect storage cache.
   */
  uncache(text: string): void {
    this.localCache = this.localCache.filter((x) => x.text !== text);
  }

  preload(
    text: string,
    options: TTSModelOptions,
    position: number,
    context: AudioTextContext = {},
  ): void {
    // Check if already queued
    const found = this.backgroundQueue.find(
      (x) => x.text === text && mobx.comparer.structural(x.options, options),
    );
    if (found) {
      return;
    }

    // Check if already in local memory cache (loading or loaded)
    const loaded = this.localCache.find(
      (x) => x.text === text && mobx.comparer.structural(x.options, options),
    );
    if (loaded) {
      return;
    }
    this.backgroundQueue.push({
      text,
      options,
      requestedTime: Date.now(),
      context,
      position,
    });
    this.backgroundRequestProcessor.startIfNot();
  }

  async load(
    text: string,
    options: TTSModelOptions,
    context: AudioTextContext = {},
  ): Promise<AudioData> {
    const existing = this.localCache.find(
      (x) => x.text === text && mobx.comparer.structural(x.options, options), // Use structural comparison
    );

    if (existing) {
      existing.requestedTime = Date.now();
      return existing.result;
    } else {
      const audio = this.createCachedAudio(text, options, context);
      this.localCache.push(audio);
      return audio.result;
    }
  }

  destroy(): void {
    this.backgroundRequestProcessor.stop();
    this.garbageCollector.stop();
    // Clear caches and queue on destroy
    this.localCache = [];
    this.backgroundQueue = [];
    this.backgroundActiveCount = 0;
  }

  private createCachedAudio(
    text: string,
    options: TTSModelOptions,
    context: AudioTextContext = {},
  ): CachedAudio {
    const audio: CachedAudio = {
      text,
      options,
      requestedTime: Date.now(),
      result: this.tryLoadTrack(text, options, 0, 3, context).catch((e) => {
        this.destroyCachedAudio(audio);
        throw e;
      }),
    };
    return audio;
  }

  private destroyCachedAudio(audio: CachedAudio): void {
    const index = this.localCache.indexOf(audio);
    if (index !== -1) {
      this.localCache.splice(index, 1);
    }
  }

  // Processes the queue
  private processBackgroundQueue(): boolean {
    if (this.backgroundActiveCount >= this.MAX_BACKGROUND_REQUESTS) {
      return true;
    }
    if (this.backgroundQueue.length === 0) {
      return false;
    }

    const item = this.backgroundQueue.shift()!; // Take one item
    const itemOptions: TTSModelOptions = item.options;

    this.backgroundActiveCount += 1; // Increment active *requests* count by 1
    this.load(item.text, itemOptions, item.context).finally(() => {
      this.backgroundActiveCount -= 1;
      this.processBackgroundQueue(); // Check for more work
    });

    return true; // Keep processor running if queue might still have items or requests are active
  }

  private processGarbage(): boolean {
    this.localCache = this.localCache.filter(
      (entry) => Date.now() - entry.requestedTime < this.MAX_LOCAL_TTL_MILLIS,
    );
    return true;
  }

  private async tryLoadTrack(
    track: string,
    options: TTSModelOptions,
    attempt: number = 0,
    maxAttempts: number = 3,
    context: AudioTextContext = {},
  ): Promise<AudioData> {
    try {
      return await this.loadTrack(track, options, context);
    } catch (ex) {
      console.log("error loading track", ex);
      const errorInfo = ex instanceof TTSErrorInfo ? ex : undefined;
      const canRetry =
        attempt < maxAttempts && (errorInfo ? errorInfo.isRetryable : true);
      if (!canRetry) {
        throw ex;
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * Math.pow(2, attempt)),
        );
        return await this.tryLoadTrack(
          track,
          options,
          attempt + 1,
          maxAttempts,
          context,
        );
      }
    }
  }

  /** non-stateful function (barring layers of caching and API calls) */
  private async loadTrack(
    text: string,
    options: TTSModelOptions,
    context: AudioTextContext = {},
  ): Promise<AudioData> {
    // First, check cache for mp3 format
    const cachedMp3 = await this.system.storage.getAudio(text, options, "mp3");
    if (cachedMp3) {
      return cachedMp3;
    }

    // Call provider and save audio in its native format
    const audio = await this.system.ttsModel.call(
      text,
      options,
      this.system.settings,
      context,
    );
    await this.system.storage.saveAudio(text, options, audio);

    // Convert to playable format (mp3) if needed
    const playable = await convertToPlayableFormat(audio);

    // Cache the converted mp3 if it was converted
    if (playable !== audio) {
      await this.system.storage.saveAudio(text, options, playable);
    }

    return playable;
  }
}

// --- Helper Interfaces and Functions ---
interface IntervalDaemon {
  stop: () => IntervalDaemon;
  startIfNot: () => IntervalDaemon;
}

type ShouldContinue = boolean;

/** runs the work function every interval, until the work function returns false. Can be stopped and started. */
export function IntervalDaemon(
  doWork: () => ShouldContinue,
  opts: {
    interval: number;
  },
): IntervalDaemon {
  let timer: undefined | ReturnType<typeof setInterval>;
  const processor: IntervalDaemon = {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      return processor;
    },
    startIfNot: () => {
      if (timer !== undefined) {
        return processor;
      }
      let shouldContinue = true;
      try {
        shouldContinue = doWork();
      } catch (ex) {
        // Decide whether to stop or continue based on error? For now, assume continue.
        shouldContinue = true;
      }
      if (shouldContinue) {
        timer = setInterval(() => {
          let shouldContinueInterval = true;
          try {
            shouldContinueInterval = doWork();
          } catch (ex) {
            // Decide whether to stop or continue based on error? For now, assume continue.
            shouldContinueInterval = true;
          }
          if (!shouldContinueInterval) {
            processor.stop();
          }
        }, opts.interval);
      }
      return processor;
    },
  };
  return processor;
}

interface BackgroundRequest {
  /** the text that was requested */
  text: string;
  /** the options used to generate this audio */
  options: TTSModelOptions;
  /** the time the request was made. Milliseconds since Unix Epoch */
  requestedTime: number;
  /** the context that was requested */
  context: AudioTextContext;
  /** the position that was requested */
  position: number;
}

interface CachedAudio {
  /** the text that was requested */
  readonly text: string;
  /** the index for the text */
  readonly index?: number;
  /** the options used to generate this audio */
  readonly options: TTSModelOptions;
  /** the final result of the request across retries */
  readonly result: Promise<AudioData>;
  /** the time the request was made. Milliseconds since Unix Epoch. May be updated to prevent deletion */
  requestedTime: number;
}
