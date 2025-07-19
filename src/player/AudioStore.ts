import * as mobx from "mobx";
import { action, observable } from "mobx";
import {
  ActiveAudioText,
  ActiveAudioTextImpl,
  buildTrack,
} from "./ActiveAudioText";
import { AudioSystem } from "./AudioSystem";
import { AudioText, AudioTextOptions } from "./AudioTextChunk";

/** High level track changer interface */
export interface AudioStore {
  // observables
  activeText: ActiveAudioText | null;

  // switches the active track
  // returns a track ID
  // starts playing the audio
  startPlayer(opts: AudioTextOptions): Promise<ActiveAudioText>;

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
  system,
}: {
  system: AudioSystem;
}): AudioStore {
  const store = new AudioStoreImpl(system);
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  system: AudioSystem;

  constructor(system: AudioSystem) {
    this.system = system;
    mobx.makeObservable(this, {
      activeText: observable,
      closePlayer: action,
    });
    this.initializeBackgroundProcessors();
  }

  getStorageSize(): Promise<number> {
    return this.system.storage.getStorageSize();
  }

  async exportAudio(text: string): Promise<ArrayBuffer> {
    // TODO make this an async generator, that gets chunked according to the model's max length
    const options = this.system.ttsModel.convertToOptions(this.system.settings);
    return await this.system.ttsModel.call(
      text,
      options,
      [],
      this.system.settings,
    );
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
  destroy(): void {
    this.closePlayer();
    this.system.audioSink.pause();
    this._backgroundProcesses.forEach((p) => p.shutdown());
    this._backgroundProcesses = [];
  }
}
