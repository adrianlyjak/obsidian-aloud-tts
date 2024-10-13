import * as mobx from "mobx";
import { action, observable } from "mobx";
import { AudioCache, memoryStorage } from "./AudioCache";
import { AudioSink } from "./AudioSink";
import { TTSModel, openAITextToSpeech, toModelOptions } from "./TTSModel";
import { TTSPluginSettings } from "./TTSPluginSettings";
import {
  ActiveAudioText,
  ActiveAudioTextImpl,
  AudioText,
  AudioTextOptions,
  buildTrack,
} from "./ActiveAudioText";

/** High level track changer interface */
export interface AudioStore {
  // observables
  activeText: ActiveAudioText | null;

  // switches the active track
  // returns a track ID
  // starts playing the audio
  startPlayer(opts: AudioTextOptions): ActiveAudioText;

  closePlayer(): void;

  /** exports an mp3 audio file. TODO make this better */
  exportAudio(text: string): Promise<ArrayBuffer>;

  /**
   * destroys this audio store. Further interaction
   * with the store may not work after calling this
   */
  destroy(): void;

  /** remove all cached audio */
  clearStorage(): Promise<void>;

  /** gets the cache disk usage in bytes */

  getStorageSize(): Promise<number>;
}

export function loadAudioStore({
  settings,
  audioSink,
  storage = memoryStorage(),
  textToSpeech = openAITextToSpeech,
  backgroundLoaderIntervalMillis,
}: {
  settings: TTSPluginSettings;
  storage?: AudioCache;
  textToSpeech?: TTSModel;
  audioSink: AudioSink;
  backgroundLoaderIntervalMillis?: number;
}): AudioStore {
  const store = new AudioStoreImpl(settings, storage, textToSpeech, audioSink, {
    backgroundLoaderIntervalMillis,
  });
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  settings: TTSPluginSettings;
  storage: AudioCache;
  textToSpeech: TTSModel;
  sink: AudioSink;
  backgroundLoaderIntervalMillis: number;

  constructor(
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: TTSModel,
    sink: AudioSink,
    {
      backgroundLoaderIntervalMillis = 1000,
    }: {
      backgroundLoaderIntervalMillis?: number;
    } = {},
  ) {
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    this.sink = sink;
    this.backgroundLoaderIntervalMillis = backgroundLoaderIntervalMillis;
    mobx.makeObservable(this, {
      activeText: observable,
      startPlayer: action,
      closePlayer: action,
    });
    this.initializeBackgroundProcessors();
    return this;
  }

  getStorageSize(): Promise<number> {
    return this.storage.getStorageSize();
  }

  exportAudio(text: string): Promise<ArrayBuffer> {
    return this.textToSpeech(text, toModelOptions(this.settings));
  }

  _backgroundProcesses: { shutdown: () => void }[] = [];
  private initializeBackgroundProcessors(): void {
    // function, in case duration is changed
    const getExpiryMillis = () => this.settings.cacheDurationMillis;

    // expire on startup
    this.storage.expire(getExpiryMillis());

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
          this.storage.expire(ageInMillis);
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
      () => this.settings.playbackSpeed,
      (rate) => {
        this.sink.setRate(rate);
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
    return this.storage.expire(0);
  }

  startPlayer(opts: AudioTextOptions): ActiveAudioText {
    this.sink.clearMedia();
    const audio: AudioText = buildTrack(opts, this.settings.chunkType);
    this.activeText?.destroy();
    this.activeText = new ActiveAudioTextImpl(
      audio,
      this.settings,
      this.storage,
      this.textToSpeech,
      this.sink,
      {
        backgroundLoaderIntervalMillis: this.backgroundLoaderIntervalMillis,
      },
    );
    this.activeText!.play();
    return this.activeText!;
  }
  closePlayer(): void {
    this.activeText?.destroy();
    this.activeText = null;
  }
  destroy(): void {
    this.closePlayer();
    this.sink.pause();
    this._backgroundProcesses.forEach((p) => p.shutdown());
    this._backgroundProcesses = [];
  }
}
