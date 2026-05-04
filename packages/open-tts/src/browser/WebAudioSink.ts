import * as mobx from "mobx";
import { AudioSink, DecodedAudioData, TrackStatus } from "../player/AudioSink";
import { CancellablePromise } from "../player/CancellablePromise";

type WindowWithManagedMediaSource = Window & {
  ManagedMediaSource?: typeof MediaSource;
};

export class WebAudioSink implements AudioSink {
  _trackStatus: TrackStatus = "paused";

  _completionChecker?: ReturnType<typeof setTimeout> = undefined;
  _lastActivePlayPosition = 0;
  _audio: HTMLAudioElement;
  private _sourceBuffer: SourceBuffer;
  private _objectUrl: string | undefined;
  _isPlaying = false;

  get audioElement(): HTMLAudioElement {
    return this._audio;
  }

  get bufferedStart(): number | undefined {
    const buffered = this._sourceBuffer.buffered;
    return buffered.length > 0 ? buffered.start(0) : undefined;
  }

  async decodeAudioData(audio: ArrayBuffer): Promise<DecodedAudioData> {
    const context = new AudioContext();
    try {
      const clonedBuffer = audio.slice(0);
      return await context.decodeAudioData(clonedBuffer);
    } finally {
      await context.close();
    }
  }

  waitForSeeking(): CancellablePromise<void> {
    return CancellablePromise.fromEvent(this._audio, "seeking").thenCancellable(
      () => undefined,
    );
  }

  static async create(): Promise<WebAudioSink> {
    const preferMMS = false;
    const managedMediaSource = (window as WindowWithManagedMediaSource)
      .ManagedMediaSource;
    const sources = preferMMS
      ? [managedMediaSource, window.MediaSource]
      : [window.MediaSource, managedMediaSource];
    const Source = sources.filter((x) => !!x)[0];
    if (!Source) {
      throw new Error("No MediaSource available");
    }
    const audioSource = new Source();
    const audio = new Audio();

    audio.disableRemotePlayback = true;
    audio.controls = true;

    const objectUrl = URL.createObjectURL(audioSource);
    audio.src = objectUrl;
    await once("sourceopen", audioSource);

    const sourceBuffer = audioSource.addSourceBuffer("audio/mpeg");
    await onceBuffUpdateEnd(sourceBuffer);
    const sink = new WebAudioSink(audio, sourceBuffer);
    sink._objectUrl = objectUrl;
    return sink;
  }

  constructor(_audio: HTMLAudioElement, _sourceBuffer: SourceBuffer) {
    this._audio = _audio;
    this._sourceBuffer = _sourceBuffer;
    mobx.makeObservable(this, {
      _trackStatus: mobx.observable,
      _audio: mobx.observable.ref,
      _isPlaying: mobx.observable,
      audioElement: mobx.computed,
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

  seek(seconds: number = 1): void {
    this._audio.currentTime = this.audioElement.currentTime + seconds;
  }

  setRate(rate: number): void {
    this._audio.playbackRate = rate;
  }

  get trackStatus(): TrackStatus {
    return this._trackStatus;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get currentTime(): number {
    return this._audio.currentTime;
  }

  set currentTime(value: number) {
    this._audio.currentTime = value;
  }

  private getTrackStatus(): TrackStatus {
    const position = this._audio.currentTime;
    const buff = this._sourceBuffer.buffered;
    const lastIndex = buff.length - 1;
    const duration = buff.length > 0 ? buff.end(lastIndex) : undefined;
    let safeMargin = 0;
    if (this._lastActivePlayPosition === position) {
      safeMargin = 0.5;
    } else {
      this._lastActivePlayPosition = position;
    }
    if (duration && position >= duration - safeMargin) {
      return "complete";
    }
    if (this._audio.paused) {
      return "paused";
    }
    return "playing";
  }

  _updateTrackStatus(): void {
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
    await this._evictOldBufferData();
    this.loopCheckCompletion();
    this._updateTrackStatus();
  }

  private static readonly MAX_BUFFER_BEHIND_SECS = 60;

  private async _evictOldBufferData(): Promise<void> {
    try {
      const buffered = this._sourceBuffer.buffered;
      if (buffered.length === 0) return;

      const currentTime = this._audio.currentTime;
      const bufferStart = buffered.start(0);
      const behindAmount = currentTime - bufferStart;

      if (behindAmount > WebAudioSink.MAX_BUFFER_BEHIND_SECS) {
        const removeEnd = currentTime - WebAudioSink.MAX_BUFFER_BEHIND_SECS;
        this._sourceBuffer.remove(bufferStart, removeEnd);
        await onceBuffUpdateEnd(this._sourceBuffer);
      }
    } catch (e) {
      console.warn("Failed to evict old SourceBuffer data:", e);
    }
  }

  async mediaComplete(): Promise<void> {
    this._isPlaying = false;
    this._audio.pause();
  }

  async clearMedia(): Promise<void> {
    if (this._sourceBuffer.buffered.length > 0) {
      const wasZero = this._audio.currentTime === 0;
      let seekComplete: CancellablePromise<void> | undefined;
      if (!wasZero) {
        const wasSeeking = this._audio.seeking;
        this._audio.currentTime = 0;
        if (!wasSeeking) {
          seekComplete = CancellablePromise.fromEvent(
            this._audio,
            "seeked",
          ).thenCancellable(() => undefined);
        }
      }
      this._sourceBuffer.remove(0, this._sourceBuffer.buffered.end(0));
      await onceBuffUpdateEnd(this._sourceBuffer);
      this._sourceBuffer.timestampOffset = 0;
      await onceBuffUpdateEnd(this._sourceBuffer);
      if (seekComplete) {
        await CancellablePromise.race([
          CancellablePromise.delay(500),
          seekComplete,
        ]);
      }
      this._updateTrackStatus();
    }
  }

  play(): void {
    this._audio.play();
  }

  private loopCheckCompletion(): void {
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

  pause(): void {
    this._audio.pause();
  }

  _onplay = (): void => {
    this._updateTrackStatus();
    this.loopCheckCompletion();
    this._isPlaying = true;
  };

  _onpause = (): void => {
    this._updateTrackStatus();
    clearInterval(this._completionChecker);
    this._isPlaying = false;
  };

  _onseeked = (): void => {
    if (!this._sourceBuffer.buffered.length) {
      this._audio.currentTime = 0;
    } else if (
      this.audioElement.currentTime > this._sourceBuffer.buffered.end(0)
    ) {
      this._audio.currentTime = this._sourceBuffer.buffered.end(0);
    } else if (this._audio.currentTime < this._sourceBuffer.buffered.start(0)) {
      this._audio.currentTime = this._sourceBuffer.buffered.start(0);
    }
    this._updateTrackStatus();
    this.loopCheckCompletion();
  };

  restart(): void {
    this._audio.currentTime = 0;
    this.play();
  }

  destroy(): void {
    clearTimeout(this._completionChecker);
    this._audio.removeEventListener("play", this._onplay);
    this._audio.removeEventListener("pause", this._onpause);
    this._audio.removeEventListener("seeked", this._onseeked);
    this._audio.pause();
    try {
      if (this._sourceBuffer.buffered.length > 0) {
        this._sourceBuffer.remove(
          0,
          this._sourceBuffer.buffered.end(
            this._sourceBuffer.buffered.length - 1,
          ),
        );
      }
    } catch (_) {
      // MediaSource can already be closing.
    }
    this._audio.removeAttribute("src");
    this._audio.load();
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = undefined;
    }
  }
}

function once<S extends string>(
  event: S,
  emitter: {
    addEventListener: (event: S, listener: () => void) => void;
    removeEventListener: (event: S, listener: () => void) => void;
  },
): Promise<void> {
  return new Promise<void>((resolve) => {
    const listener = () => {
      resolve();
      emitter.removeEventListener(event, listener);
    };
    emitter.addEventListener(event, listener);
  });
}

async function onceBuffUpdateEnd(sb: SourceBuffer): Promise<void> {
  if (sb.updating) {
    await once("updateend", sb);
  }
}
