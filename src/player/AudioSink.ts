import * as mobx from "mobx";

export type TrackStatus = "playing" | "paused" | "complete";

export interface AudioSink {
  /**
   * indicates whether the audio is currently in a playing state
   *
   * note: this is NOT equivalent to trackStatus === "playing". This signals whether the audio _should_ be playing.
   * So this will be true in the case where a track is "stalled" due to an upstream loading delay. In that case trackStatus === "complete."
   *
   * Additionally, this will be false when the audio has been set to a "complete" state by the data source.
   */
  readonly isPlaying: boolean;
  /** observable for the currently playing track status */
  readonly trackStatus: TrackStatus;
  /** Web Audio stuff, for observing the audio state, like visualization */
  readonly audio: HTMLAudioElement;

  /** play the current audio */
  play(): void;
  /** pause the current audio */
  pause(): void;
  /** move the audio to the beginning of the track */
  restart(): void;
  /** change the playback rate of the audio */
  setRate(rate: number): void;

  /** remove existing media, must be called before starting a new audio */
  clearMedia(): Promise<void>;
  /** utility to decode arbitrary audio data to a wave form audio buffer*/
  getAudioBuffer(audio: ArrayBuffer): Promise<AudioBuffer>;
  /** called by the data source to replace the current audio track with the new one */
  switchMedia(data: ArrayBuffer): Promise<void>;
  /** called by the data source to append audio data to the current playing track */
  appendMedia(data: ArrayBuffer): Promise<void>;
  /** called by the data source when the audio is complete */
  mediaComplete(): Promise<void>;
}

export class WebAudioSink implements AudioSink {
  _trackStatus: TrackStatus = "paused";

  _completionChecker?: ReturnType<typeof setTimeout> = undefined;
  _lastActivePlayPosition = 0;
  _audio: HTMLAudioElement;
  private _sourceBuffer: SourceBuffer;
  _isPlaying = false;

  get audio(): HTMLAudioElement {
    return this._audio;
  }

  async getAudioBuffer(audio: ArrayBuffer): Promise<AudioBuffer> {
    const context = new AudioContext();
    try {
      return await context.decodeAudioData(audio);
    } finally {
      await context.close();
    }
  }

  static async create(): Promise<WebAudioSink> {
    const preferMMS = false;
    const sources = preferMMS
      ? [window.ManagedMediaSource, window.MediaSource]
      : [window.MediaSource, window.ManagedMediaSource];
    const Source = sources.filter((x) => !!x)[0];
    if (!Source) {
      throw new Error("No MediaSource available");
    }
    const audioSource = new Source();
    const audio = new Audio();

    // required for ManagedMediaSource to open
    audio.disableRemotePlayback = true;
    audio.controls = true;

    // end required for ManagedMediaSource to open
    audio.src = URL.createObjectURL(audioSource);
    await once("sourceopen", audioSource);

    const sourceBuffer = audioSource!.addSourceBuffer("audio/mpeg");
    await onceBuffUpdateEnd(sourceBuffer);
    const sink = new WebAudioSink(audio, sourceBuffer);
    return sink;
  }

  constructor(_audio: HTMLAudioElement, _sourceBuffer: SourceBuffer) {
    (window as any)["audioSink"] = this;
    this._audio = _audio;
    this._sourceBuffer = _sourceBuffer;
    mobx.makeObservable(this, {
      _trackStatus: mobx.observable,
      _audio: mobx.observable.ref,
      _isPlaying: mobx.observable,
      audio: mobx.computed,
      play: mobx.action,
      pause: mobx.action,
      restart: mobx.action,
      trackStatus: mobx.computed,
      isPlaying: mobx.computed,
      _updateTrackStatus: mobx.action,
      _onpause: mobx.action,
      _onplay: mobx.action,
    });
    this._audio.addEventListener("play", this._onplay);
    this._audio.addEventListener("pause", this._onpause);
    this._audio.addEventListener("seeked", this._onseeked);
  }

  setRate(rate: number) {
    this._audio.playbackRate = rate;
  }

  get trackStatus(): TrackStatus {
    return this._trackStatus;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  private getTrackStatus() {
    const position = this._audio.currentTime;
    const buff = this._sourceBuffer.buffered;
    const lastIndex = buff.length - 1;
    const duration = buff.length > 0 ? buff.end(lastIndex) : undefined;
    let safemargin = 0;
    if (this._lastActivePlayPosition === position) {
      safemargin = 0.5;
    } else {
      this._lastActivePlayPosition = position;
    }
    if (duration && position >= duration - safemargin) {
      return "complete";
    } else if (this._audio.paused) {
      return "paused";
    } else {
      return "playing";
    }
  }

  _updateTrackStatus() {
    this._trackStatus = this.getTrackStatus();
  }

  async switchMedia(data: ArrayBuffer): Promise<void> {
    await onceBuffUpdateEnd(this._sourceBuffer);
    const buffered = this._sourceBuffer.buffered;
    if (buffered.length > 0) {
      const end = buffered.end(buffered.length - 1);
      this._sourceBuffer.remove(0, end);
      this._audio.currentTime = 0;
      await onceBuffUpdateEnd(this._sourceBuffer);
      this._sourceBuffer.timestampOffset = 0;
      await onceBuffUpdateEnd(this._sourceBuffer);
    }
    this._sourceBuffer.appendBuffer(data);
    await onceBuffUpdateEnd(this._sourceBuffer);
    this.loopCheckCompletion();
    this._updateTrackStatus();
  }

  async appendMedia(data: ArrayBuffer): Promise<void> {
    await onceBuffUpdateEnd(this._sourceBuffer);
    const buffered = this._sourceBuffer.buffered;
    if (buffered.length > 0) {
      this._sourceBuffer.timestampOffset = buffered.end(buffered.length - 1);
      await onceBuffUpdateEnd(this._sourceBuffer);
    }
    this._sourceBuffer.appendBuffer(data);
    await onceBuffUpdateEnd(this._sourceBuffer);
    this.loopCheckCompletion();
    this._updateTrackStatus();
  }

  async mediaComplete() {
    this._isPlaying = false;
    this._audio.pause();
  }

  async clearMedia() {
    if (this._sourceBuffer.buffered.length > 0) {
      this._audio.currentTime = 0;

      this._sourceBuffer.remove(0, this._sourceBuffer.buffered.end(0));
      await onceBuffUpdateEnd(this._sourceBuffer);
      this._sourceBuffer.timestampOffset = 0;
      await onceBuffUpdateEnd(this._sourceBuffer);
      this._updateTrackStatus();
    }
  }

  play() {
    this._audio.play();
  }

  private loopCheckCompletion() {
    clearTimeout(this._completionChecker);
    const sb = this._sourceBuffer;
    const audio = this._audio;
    const buff = sb.buffered;
    if (buff.length === 0) {
      return;
    }
    const untilDone = buff.end(buff.length - 1) - audio.currentTime;
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
    this._audio.pause();
  }

  _onplay = () => {
    this._updateTrackStatus();
    this.loopCheckCompletion();
    this._isPlaying = true;
  };
  _onpause = () => {
    this._updateTrackStatus();
    clearInterval(this._completionChecker);
    this._isPlaying = false;
  };

  _onseeked = () => {
    if (!this._sourceBuffer.buffered.length) {
      this._audio.currentTime = 0;
    } else if (this.audio.currentTime > this._sourceBuffer.buffered.end(0)) {
      this._audio.currentTime = this._sourceBuffer.buffered.end(0);
    }
    this._updateTrackStatus();
    this.loopCheckCompletion();
  };

  restart() {
    this._audio.currentTime = 0;
    this.play();
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

async function onceBuffUpdateEnd(sb: SourceBuffer) {
  if (sb.updating) {
    await once("updateend", sb);
  }
}
