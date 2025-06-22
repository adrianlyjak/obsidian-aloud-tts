import cleanMarkup from "../util/cleanMarkdown";
import { CancellablePromise } from "./CancellablePromise";
import { TTSErrorInfo } from "./TTSModel";
import * as mobx from "mobx";
import { action, observable } from "mobx";

/** data to run TTS on */
export interface AudioTextOptions {
  filename: string;
  text: string;
  // character index of the start of the text track
  start: number;
  // character index of the end of the text track
  end: number;
  // minimum chunk length before merging with the next (e.g. short sentences are added to the next sentence)
  minChunkLength?: number;
}

/** Container for lazily loaded TTS that's text has been chunked for faster streaming of output and seeking of position by chunk */
export interface AudioText {
  id: string;
  filename: string;
  friendlyName: string;
  created: number;
  chunks: AudioTextChunk[];
}

/** A chunk of the text to be played */
export class AudioTextChunk {
  rawText: string;
  text: string;
  start: number;
  end: number;
  duration?: number;
  audio?: ArrayBuffer;
  loading: boolean;
  failed?: boolean;
  failureInfo?: TTSErrorInfo;
  audioBuffer?: AudioBuffer;
  offsetDuration?: number;
  retryCount: number;
  lastFailureTime?: number;

  constructor(opts: { rawText: string; start: number; end: number }) {
    this.rawText = opts.rawText;
    this.text = cleanMarkup(this.rawText);
    this.start = opts.start;
    this.end = opts.end;
    this.duration = undefined;
    this.audio = undefined;
    this.loading = false;
    this.failed = undefined;
    this.failureInfo = undefined;
    this.audioBuffer = undefined;
    this.offsetDuration = undefined;
    this.retryCount = 0;
    this.lastFailureTime = undefined;

    mobx.makeObservable(this, {
      rawText: observable,
      text: observable,
      start: observable,
      end: observable,
      duration: observable,
      offsetDuration: observable,
      audio: observable.ref,
      loading: observable,
      failed: observable,
      failureInfo: observable.ref,
      audioBuffer: observable.ref,
      retryCount: observable,
      lastFailureTime: observable,
      reset: action,
      updateText: action,
      setFailed: action,
      setLoading: action,
      setLoaded: action,
      setAudioBuffer: action,
      canRetry: action,
    });
  }

  reset() {
    this.audio = undefined;
    this.audioBuffer = undefined;
    this.loading = false;
    this.failed = undefined;
    this.failureInfo = undefined;
    this.offsetDuration = undefined;
    this.duration = undefined;
    this.lastFailureTime = undefined;
  }

  updateText(rawText: string) {
    if (this.rawText === rawText) {
      return;
    }
    this.rawText = rawText;
    this.text = cleanMarkup(this.rawText);
    this.reset();
    this.retryCount = 0;
  }

  setFailed(failureInfo: Error) {
    this.failed = true;
    this.retryCount++;
    this.lastFailureTime = Date.now();

    if (failureInfo instanceof TTSErrorInfo) {
      this.failureInfo = failureInfo;
    }
    this.loading = false;

    console.warn(
      `音频块失败 (第${this.retryCount}次): "${this.text.substring(0, 30)}..."`,
      failureInfo,
    );
  }

  setLoading() {
    this.loading = true;
    this.failed = undefined;
    this.failureInfo = undefined;
  }

  setLoaded(audio: ArrayBuffer) {
    this.audio = audio;
    this.loading = false;
    this.failed = false;
    this.failureInfo = undefined;
    this.retryCount = 0;
    this.lastFailureTime = undefined;
  }

  setAudioBuffer(audioBuffer: AudioBuffer, offsetDuration: number) {
    this.audioBuffer = audioBuffer;
    this.duration = audioBuffer.duration;
    this.offsetDuration = offsetDuration;
  }

  canRetry(): boolean {
    const maxRetries = 3;
    const retryDelayMs = 5000; // 5秒后才能重试

    if (this.retryCount >= maxRetries) {
      return false;
    }

    if (
      this.lastFailureTime &&
      Date.now() - this.lastFailureTime < retryDelayMs
    ) {
      return false;
    }

    return true;
  }

  onceLoaded(fully: boolean = false): CancellablePromise<ArrayBuffer> {
    const when = mobx.when(
      () =>
        !this.loading &&
        !!this.audio &&
        (fully ? typeof this.duration === "number" : true),
    );
    return CancellablePromise.from(when).thenCancellable(() => this.audio!);
  }
}
