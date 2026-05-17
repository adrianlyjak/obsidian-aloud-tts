import * as mobx from "mobx";
import { action, observable } from "mobx";
import {
  ActiveAudioText,
  ActiveAudioTextImpl,
  buildTrack,
} from "./ActiveAudioText";
import { AudioSystem } from "./AudioSystem";
import { AudioText, AudioTextOptions } from "./AudioTextChunk";
import { splitTextForExport } from "../util/misc";
import { concatenateMp3Buffers } from "../util/audioProcessing";
// AudioData is returned from provider calls, but exportAudio concatenates raw bytes

/** Progress of an in-flight export, reported per text chunk. */
export interface ExportProgress {
  /** Chunks generated so far. */
  completed: number;
  /** Total chunks for this export. */
  total: number;
}

/** High level track changer interface */
export interface AudioStore {
  // observables
  activeText: ActiveAudioText | null;
  autoScrollEnabled: boolean;
  /** Non-null while `exportAudio` is running. */
  exportProgress: ExportProgress | null;

  // switches the active track
  // returns a track ID
  // starts playing the audio
  startPlayer(opts: AudioTextOptions): Promise<ActiveAudioText>;

  closePlayer(): void;

  /** exports an mp3 audio file. TODO make this better */
  exportAudio(text: string): Promise<ArrayBuffer>;

  /** Aborts the currently-running `exportAudio` at the next chunk boundary. */
  cancelExport(): void;

  /**
   * destroys this audio store. Further interaction
   * with the store may not work after calling this
   */
  destroy(): void;

  /** remove all cached audio */
  clearStorage(): Promise<void>;

  /** gets the cache disk usage in bytes */
  getStorageSize(): Promise<number>;

  /** enable/disable autoscroll */
  setAutoScrollEnabled(enabled: boolean): void;

  /** disable autoscroll (when user scrolls manually) */
  disableAutoScroll(): void;

  /** enable autoscroll and scroll to current position */
  enableAutoScrollAndScrollToCurrent(): void;

  /** mark that a programmatic editor scroll just happened */
  markProgrammaticScroll(): void;

  /** last programmatic editor scroll time, in milliseconds since epoch */
  getLastProgrammaticScroll(): number;
}

export function loadAudioStore({
  system,
}: {
  system: AudioSystem;
}): AudioStore {
  const store = new AudioStoreImpl(system);
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  autoScrollEnabled = true;
  exportProgress: ExportProgress | null = null;
  private exportAbortController: AbortController | null = null;
  private lastProgrammaticScroll = 0;
  system: AudioSystem;

  constructor(system: AudioSystem) {
    this.system = system;
    // Initialize from persistent setting
    this.autoScrollEnabled = system.settings.autoScrollPlayerView;
    mobx.makeObservable(this, {
      activeText: observable,
      autoScrollEnabled: observable,
      exportProgress: observable.ref,
      closePlayer: action,
      cancelExport: action,
      markProgrammaticScroll: action,
    });

    this.initializeBackgroundProcessors();
  }

  getStorageSize(): Promise<number> {
    return this.system.storage.getStorageSize();
  }

  cancelExport(): void {
    this.exportAbortController?.abort();
  }

  async exportAudio(text: string): Promise<ArrayBuffer> {
    const options = this.system.ttsModel.convertToOptions(this.system.settings);

    // Get model's practical character limit (most models have 4000-4096 limit)
    const maxChunkSize = 4000; // Conservative limit to avoid hitting model limits

    const controller = new AbortController();
    this.exportAbortController = controller;
    const signal = controller.signal;
    const setProgress = action(
      "setExportProgress",
      (progress: ExportProgress | null) => {
        this.exportProgress = progress;
      },
    );

    const throwIfAborted = () => {
      if (signal.aborted) {
        throw new DOMException("Export cancelled", "AbortError");
      }
    };

    try {
      // If text is short enough, process directly
      if (text.length <= maxChunkSize) {
        setProgress({ completed: 0, total: 1 });
        throwIfAborted();
        const audio = await this.system.ttsModel.call(
          text,
          options,
          this.system.settings,
          undefined,
          signal,
        );
        setProgress({ completed: 1, total: 1 });
        // export remains mp3 for now; if not mp3, we could convert later
        return audio.data;
      }

      // Split text into chunks with context that respect sentence boundaries
      const chunksWithContext = splitTextForExport(text, maxChunkSize, 2);
      const renderable = chunksWithContext.filter((c) => c.text.trim());
      const decodedAudios: ArrayBuffer[] = [];
      setProgress({ completed: 0, total: renderable.length });

      // Generate audio for each chunk
      for (const chunk of renderable) {
        throwIfAborted();
        const audio = await this.system.ttsModel.call(
          chunk.text,
          options,
          this.system.settings,
          chunk.context,
          signal,
        );
        decodedAudios.push(audio.data);
        setProgress({
          completed: decodedAudios.length,
          total: renderable.length,
        });
      }

      throwIfAborted();
      // Concatenate all audio buffers into a single MP3
      return await concatenateMp3Buffers(decodedAudios, this.system.audioSink);
    } finally {
      if (this.exportAbortController === controller) {
        this.exportAbortController = null;
      }
      setProgress(null);
    }
  }

  _backgroundProcesses: { shutdown: () => void }[] = [];
  private initializeBackgroundProcessors(): void {
    // function, in case duration is changed
    const getExpiryMillis = () => this.system.settings.cacheDurationMillis;

    // expire on startup
    this.system.storage.expire(getExpiryMillis());

    let expireTimer: ReturnType<typeof setInterval> | undefined;
    const restartInterval = () => {
      clearInterval(expireTimer);
      const ageInMillis = getExpiryMillis();
      const checkFrequency = ageInMillis / 16;
      // check at most once per minute, and at least once per hour
      const minCheckFrequency = 1000; //* 60;
      const maxCheckFrequency = 1000 * 60; //* 60;
      expireTimer = setInterval(
        () => {
          this.system.storage.expire(ageInMillis);
        },
        Math.min(
          maxCheckFrequency,
          Math.max(minCheckFrequency, checkFrequency),
        ),
      );
    };

    const cancelReaction = mobx.reaction(
      () => getExpiryMillis(),
      () => restartInterval(),
      {
        fireImmediately: true,
      },
    );

    const cancelRateReaction = mobx.reaction(
      () => this.system.settings.playbackSpeed,
      (rate) => {
        this.system.audioSink.setRate(rate);
      },
      {
        fireImmediately: true,
      },
    );

    this._backgroundProcesses.push({
      shutdown: () => {
        cancelReaction();
        cancelRateReaction();
        clearInterval(expireTimer);
      },
    });
  }

  clearStorage(): Promise<void> {
    return this.system.storage.expire(0);
  }

  async startPlayer(opts: AudioTextOptions): Promise<ActiveAudioText> {
    await this.system.audioSink.clearMedia();
    const audio: AudioText = buildTrack(opts, this.system.settings.chunkType);
    this.activeText?.destroy();
    mobx.runInAction(
      () => (this.activeText = new ActiveAudioTextImpl(audio, this.system)),
    );
    this.activeText!.play();
    return this.activeText!;
  }
  closePlayer(): void {
    this.activeText?.destroy();
    this.activeText = null;
  }

  setAutoScrollEnabled = mobx.action((enabled: boolean): void => {
    this.autoScrollEnabled = enabled;
  });

  disableAutoScroll = mobx.action((): void => {
    this.autoScrollEnabled = false;
  });

  enableAutoScrollAndScrollToCurrent = mobx.action((): void => {
    this.autoScrollEnabled = true;
    // Trigger a scroll to current position by forcing a state update
    if (this.activeText) {
      // This will trigger the autoscroll logic in TTSCodeMirrorCore
      const currentPosition = this.activeText.position;
      this.activeText.position = -1; // Force change
      this.activeText.position = currentPosition; // Restore position
    }
  });

  markProgrammaticScroll = (): void => {
    this.lastProgrammaticScroll = Date.now();
  };

  getLastProgrammaticScroll(): number {
    return this.lastProgrammaticScroll;
  }

  destroy(): void {
    this.closePlayer();
    this.system.audioSink.pause();
    this._backgroundProcesses.forEach((p) => p.shutdown());
    this._backgroundProcesses = [];
  }
}
