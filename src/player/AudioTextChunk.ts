import cleanMarkup from "../util/cleanMarkdown";
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
    mobx.makeObservable(this, {
      rawText: observable,
      text: observable,
      start: observable,
      end: observable,
      duration: observable,
      audio: observable.ref,
      loading: observable,
      failed: observable,
      failureInfo: observable.ref,
      audioBuffer: observable.ref,
      reset: action,
      updateText: action,
      setFailed: action,
      setLoading: action,
      setLoaded: action,
      setAudioBuffer: action,
    });
  }

  reset() {
    this.audio = undefined;
    this.audioBuffer = undefined;
    this.loading = false;
    this.failed = undefined;
    this.failureInfo = undefined;
  }

  updateText(rawText: string) {
    if (this.rawText === rawText) {
      return;
    }
    this.rawText = rawText;
    this.text = cleanMarkup(this.rawText);
    this.reset();
  }

  setFailed(failureInfo: Error) {
    this.failed = true;
    if (failureInfo instanceof TTSErrorInfo) {
      this.failureInfo = failureInfo;
    }
    this.loading = false;
  }
  setLoading() {
    this.loading = true;
  }
  setLoaded(audio: ArrayBuffer) {
    this.audio = audio;
    this.loading = false;
  }
  setAudioBuffer(audioBuffer: AudioBuffer) {
    this.audioBuffer = audioBuffer;
  }
}
