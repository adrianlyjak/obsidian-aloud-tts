import * as mobx from "mobx";
import { AudioSystem } from "./AudioSystem";
import { TTSErrorInfo, TTSModelOptions } from "../models/tts-model";

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

  preload(text: string, options: TTSModelOptions, position: number): void {
    // Check if already queued
    const alreadyQueued = this.backgroundQueue.some(
      (x) => x.text === text && mobx.comparer.structural(x.options, options),
    );
    if (alreadyQueued) {
      return;
    }

    // Check if already in local memory cache (loading or loaded)
    const alreadyLoaded = this.localCache.some(
      (x) => x.text === text && mobx.comparer.structural(x.options, options),
    );
    if (alreadyLoaded) {
      // Update requested time to prevent garbage collection if needed
      const cached = this.localCache.find(
        (x) => x.text === text && mobx.comparer.structural(x.options, options),
      );
      if (cached) cached.requestedTime = Date.now();
      return;
    }
    this.backgroundQueue.push({
      text,
      options,
      requestedTime: Date.now(),
      position,
    });
    // Sort queue by position to prioritize upcoming chunks
    this.backgroundQueue.sort((a, b) => a.position - b.position);
    this.backgroundRequestProcessor.startIfNot();
  }

  async load(
    text: string,
    options: TTSModelOptions,
    position?: number,
  ): Promise<ArrayBuffer> {
    const existing = this.localCache.find(
      (x) => x.text === text && mobx.comparer.structural(x.options, options), // Use structural comparison
    );

    if (existing) {
      existing.requestedTime = Date.now();
      return existing.result;
    } else {
      // select the last 3 chunks of the active text. Perhaps make this somehow configurable
      const audioTextChunks = position
        ? this.system.audioStore.activeText?.audio.chunks.slice(
            position - 3,
            position,
          )
        : undefined;
      const contexts = audioTextChunks?.map((x) => x.text);

      const audio = this.createCachedAudio(
        text,
        options,
        options.contextMode ? contexts : undefined,
      );
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
    contexts?: string[],
  ): CachedAudio {
    const audio: CachedAudio = {
      text,
      options,
      requestedTime: Date.now(),
      result: this.tryLoadTrack(text, options, 0, 3, contexts).catch((e) => {
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
    this.load(item.text, itemOptions, item.position).finally(() => {
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
    contexts?: string[],
  ): Promise<ArrayBuffer> {
    try {
      return await this.loadTrack(track, options, contexts);
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
          contexts,
        );
      }
    }
  }

  /** non-stateful function (barring layers of caching and API calls) */
  private async loadTrack(
    text: string,
    options: TTSModelOptions,
    contexts?: string[],
  ): Promise<ArrayBuffer> {
    // copy the settings to make sure audio isn't stored under under the wrong key
    // if the settings are changed while request is in flight
    const stored: ArrayBuffer | null = await this.system.storage.getAudio(
      text,
      options,
    );
    if (stored) {
      return stored;
    } else {
      // likely some race conditions here, if the options have changed since the request was enqueued
      const buff = await this.system.ttsModel.call(
        text,
        options,
        contexts ?? [],
        this.system.settings,
      );
      await this.system.storage.saveAudio(text, options, buff);
      return buff;
    }
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
  /** the track number that was requested */
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
  readonly result: Promise<ArrayBuffer>;
  /** the time the request was made. Milliseconds since Unix Epoch. May be updated to prevent deletion */
  requestedTime: number;
}
