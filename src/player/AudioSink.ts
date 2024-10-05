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
  readonly audio?: HTMLAudioElement;
}

export class WebAudioSink implements AudioSink {
  _trackStatus: TrackStatus = "none";
  _audio?: HTMLAudioElement = undefined;
  _audioSource?: MediaSource = undefined;
  _sourceBuffer?: SourceBuffer = undefined;

  _completionChecker?: ReturnType<typeof setTimeout> = undefined;
  _lastActivePlayPosition = 0;

  get audio(): HTMLAudioElement | undefined {
    return this._audio;
  }

  constructor() {
    mobx.makeObservable(this, {
      _trackStatus: mobx.observable,
      _audio: mobx.observable,
      audio: mobx.computed,
      play: mobx.action,
      pause: mobx.action,
      restart: mobx.action,
      remove: mobx.action,
      trackStatus: mobx.computed,
      _updateTrackStatus: mobx.action,
    });
  }

  get trackStatus(): TrackStatus {
    return this._trackStatus;
  }

  private getTrackStatus() {
    if (!this._audio) {
      return "none";
    } else {
      const position = this._audio.currentTime;
      const duration = this._sourceBuffer!.buffered.end(
        this._sourceBuffer!.buffered.length - 1,
      );
      let safemargin = 0;
      if (this._lastActivePlayPosition === position) {
        safemargin = 0.5;
      } else {
        this._lastActivePlayPosition = position;
      }
      if (position >= duration - safemargin) {
        return "complete";
      } else if (this._audio.paused) {
        return "paused";
      } else {
        return "playing";
      }
    }
  }

  _updateTrackStatus() {
    this._trackStatus = this.getTrackStatus();
  }

  async setMedia(data: ArrayBuffer): Promise<void> {
    if (!this._audio) {
      this._audioSource = new MediaSource();
      this._audio = new Audio(URL.createObjectURL(this._audioSource));
      this._audio.playbackRate = 2;
      await once("sourceopen", this._audioSource!);
      this._sourceBuffer = this._audioSource!.addSourceBuffer("audio/mpeg");
    }
    await this.onceBuffUpdateEnd();
    if (this._sourceBuffer!.buffered.length > 0) {
      const end = this._sourceBuffer!.buffered.end(
        this._sourceBuffer!.buffered.length - 1,
      );
      this._sourceBuffer?.remove(0, end);
      this._audio!.currentTime = 0;
      await this.onceBuffUpdateEnd();
      this._sourceBuffer!.timestampOffset = 0;
      await this.onceBuffUpdateEnd();
    }
    this._sourceBuffer!.appendBuffer(data);
    await this.onceBuffUpdateEnd();
    this._updateTrackStatus();
  }

  private async onceBuffUpdateEnd() {
    if (this._sourceBuffer?.updating) {
      await once("updateend", this._sourceBuffer);
    }
  }

  play() {
    if (this._audio) {
      this._audio.play();
      this._updateTrackStatus();
      this._audio.onplay = () => this._updateTrackStatus();
      this.loopCheckCompletion();
    }
  }

  private loopCheckCompletion() {
    clearTimeout(this._completionChecker);
    const sb = this._sourceBuffer!;
    const audio = this._audio!;
    const untilDone =
      sb.buffered.end(sb.buffered.length - 1) - audio.currentTime;
    const delay =
      (untilDone < 0.5 ? 100 : untilDone * 1000) /
      (this._audio?.playbackRate || 1);
    this._completionChecker = setTimeout(() => {
      const updated = this.getTrackStatus();
      if (updated !== this._trackStatus) {
        this._updateTrackStatus();
      }
      if (this._trackStatus === "playing") {
        this.loopCheckCompletion();
      }
    }, delay);
  }

  pause() {
    if (this._audio) {
      clearInterval(this._completionChecker);
      this._audio.pause();
      this._audio.onpause = () => this._updateTrackStatus();
    }
  }

  restart() {
    if (this._audio) {
      this._audio.currentTime = 0;
      this.play();
    }
  }

  remove() {
    if (this._audio) {
      this._audio.pause();
      URL.revokeObjectURL(this._audio.src);
      this._audio = undefined;
      this._updateTrackStatus();
    }
  }
}

function once<S extends string>(
  event: S,
  emitter: {
    addEventListener: (event: S, listener: () => void) => void;
    removeEventListener: (event: S, listener: () => void) => void;
  },
) {
  return new Promise<void>((resolve, reject) => {
    const listener = () => {
      resolve();
      emitter.removeEventListener(event, listener);
    };
    emitter.addEventListener(event, listener);
  });
}
