import * as mobx from "mobx";

export type TrackStatus = "playing" | "paused" | "complete";

export interface AudioSink {
  /** Sets an audio track to play */
  setMedia(data: ArrayBuffer): Promise<void>;
  /** play the current audio */
  play(): void;
  /** pause the current audio */
  pause(): void;
  /** move the audio to the beginning of the track */
  restart(): void;
  /** remove existing media, to be called before starting a new audio */
  clearMedia(): void;
  /** change the playback rate of the audio */
  setRate(rate: number): void;
  /** whether the audio is currently playing (equivalent to trackStatus === "playing") */
  readonly isPlaying: boolean;
  /** observable for the currently playing track status */
  readonly trackStatus: TrackStatus;
  /** Web Audio stuff, for observing the audio state, like visualization */
  readonly audio?: HTMLAudioElement;
  /** */
  readonly audioBuffer?: AudioBuffer;
}

export class WebAudioSink implements AudioSink {
  _trackStatus: TrackStatus = "paused";

  _completionChecker?: ReturnType<typeof setTimeout> = undefined;
  _lastActivePlayPosition = 0;
  _audio: HTMLAudioElement;
  private _audioSource: MediaSource;
  private _sourceBuffer: SourceBuffer;
  _audioBuffer?: AudioBuffer = undefined;

  get audio(): HTMLAudioElement {
    return this._audio;
  }

  get audioBuffer(): AudioBuffer | undefined {
    return this._audioBuffer;
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
    await once("sourceopen", audioSource!);

    const sourceBuffer = audioSource!.addSourceBuffer("audio/mpeg");
    await onceBuffUpdateEnd(sourceBuffer);
    const sink = new WebAudioSink(audio, audioSource, sourceBuffer);
    return sink;
  }

  constructor(
    _audio: HTMLAudioElement,
    _audioSource: MediaSource,
    _sourceBuffer: SourceBuffer,
  ) {
    this._audio = _audio;
    this._audioSource = _audioSource;
    this._sourceBuffer = _sourceBuffer;
    mobx.makeObservable(this, {
      _trackStatus: mobx.observable,
      _audio: mobx.observable.ref,
      _audioBuffer: mobx.observable.ref,
      audio: mobx.computed,
      play: mobx.action,
      pause: mobx.action,
      restart: mobx.action,
      trackStatus: mobx.computed,
      isPlaying: mobx.computed,
      _updateTrackStatus: mobx.action,
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
    return this._trackStatus === "playing";
  }

  // TODO - when audio element pauses from external OS interaction,
  // notify the upstream controllers to be paused as well
  // TODO - do rate control here
  // TODO - stop clipping from the reversion to 0 time
  // TODO - maintain max-window size history to allow for OS level back/forward
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

  async setMedia(data: ArrayBuffer): Promise<void> {
    await onceBuffUpdateEnd(this._sourceBuffer);
    mobx.runInAction(() => (this._audioBuffer = undefined));
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

    // store decoded audio data for visualization
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(data);
    mobx.runInAction(() => (this._audioBuffer = decoded));
    await context.close();
  }

  clearMedia() {
    this._audio.pause();

    if (this._sourceBuffer.buffered.length > 0) {
      this._audio.currentTime = 0;

      (async () => {
        this._sourceBuffer.remove(0, this._sourceBuffer.buffered.end(0));
        await onceBuffUpdateEnd(this._sourceBuffer);
        this._sourceBuffer.timestampOffset = 0;
        await onceBuffUpdateEnd(this._sourceBuffer);
        this._updateTrackStatus();
      })();
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
  };
  _onpause = () => {
    this._updateTrackStatus();
    clearInterval(this._completionChecker);
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
