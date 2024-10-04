import * as mobx from "mobx";

export type TrackStatus = "playing" | "paused" | "complete" | "none";

export interface AudioSink {
  /** cancel the current audio and remove references to release resources */
  remove(): void;
  /** Sets an audio track to play */
  setMedia(data: ArrayBuffer): Promise<void>;
  /** play the current audio */
  play(): void;
  /** pause the current audio */
  pause(): void;
  /** move the audio to the beginning of the track */
  restart(): void;
  /** observable for the currently playing track status */
  readonly trackStatus: TrackStatus;
  /** Web Audio stuff, for observing the audio state, like visualization */
  // readonly source: AudioNode | undefined;
  // readonly context: AudioContext | undefined;
}

export class WebAudioSink implements AudioSink {
  current?: HTMLAudioElement = undefined;
  _trackStatus: TrackStatus = "none";

  constructor() {
    mobx.makeObservable(this, {
      current: mobx.observable,
      _trackStatus: mobx.observable,
      play: mobx.action,
      pause: mobx.action,
      restart: mobx.action,
      remove: mobx.action,
      trackStatus: mobx.computed,
    });
  }

  get trackStatus(): TrackStatus {
    return this._trackStatus;
  }

  private updateTrackStatus() {
    if (!this.current) {
      this._trackStatus = "none";
    } else if (this.current.ended) {
      this._trackStatus = "complete";
    } else if (this.current.paused) {
      this._trackStatus = "paused";
    } else {
      this._trackStatus = "playing";
    }
  }

  setMedia(data: ArrayBuffer): Promise<void> {
    this.remove();
    return new Promise((resolve, reject) => {
      const blob = new Blob([data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = 2;
      audio.oncanplaythrough = () => {
        mobx.runInAction(() => {
          this.current = audio;
          this.updateTrackStatus();
          resolve();
        });
      };
      audio.onerror = reject;
    });
  }

  play() {
    if (this.current) {
      this.current.play();
      this.current.onplay = () =>
        mobx.runInAction(() => this.updateTrackStatus());
      this.current.onended = () =>
        mobx.runInAction(() => this.updateTrackStatus());
    }
  }

  pause() {
    if (this.current) {
      this.current.pause();
      this.current.onpause = () =>
        mobx.runInAction(() => this.updateTrackStatus());
    }
  }

  restart() {
    if (this.current) {
      this.current.currentTime = 0;
      this.play();
    }
  }

  remove() {
    if (this.current) {
      this.current.pause();
      URL.revokeObjectURL(this.current.src);
      this.current = undefined;
      mobx.runInAction(() => this.updateTrackStatus());
    }
  }
}
