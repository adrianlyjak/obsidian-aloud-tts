import cleanMarkup from "../util/cleanMarkdown";
import { CancellablePromise } from "./CancellablePromise";
import { TTSErrorInfo } from "../models/tts-model";
import { AudioData } from "../models/tts-model";
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
  /** The raw text from the document that this chunk is derived from */
  rawText: string;
  /** The text that has been cleaned up for passing to the TTS model */
  text: string;
  /** The character index of the start of the text track */
  start: number;
  /** The character index of the end of the text track */
  end: number;
  /** The duration of the chunk's audio in seconds. Populated from the audioBuffer.duration */
  duration?: number;
  /** The audio data for the chunk, from the TTS model */
  audio?: AudioData;
  /** Whether the chunk is currently loading */
  loading: boolean;
  /** Whether the chunk failed to load */
  failed?: boolean;
  /** The error that occurred if the chunk failed to load */
  failureInfo?: TTSErrorInfo;
  /** The audio data from the TTS model, decoded into a buffer from the AudioSink */
  audioBuffer?: AudioBuffer;
  /** The duration in seconds from the start of the full track to the start of this chunk */
  offsetDuration?: number;

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
    this.offsetDuration = undefined;
    this.duration = undefined;
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
    this.failed = undefined;
    this.failureInfo = undefined;
  }
  setLoaded(audio: AudioData) {
    this.audio = audio;
    this.loading = false;
  }
  setAudioBuffer(audioBuffer: AudioBuffer, offsetDuration: number) {
    this.audioBuffer = audioBuffer;
    this.duration = audioBuffer.duration;
    this.offsetDuration = offsetDuration;
  }

  onceLoaded(fully: boolean = false): CancellablePromise<AudioData> {
    const when = mobx.when(
      () =>
        !this.loading &&
        !!this.audio &&
        (fully ? typeof this.duration === "number" : true),
    );
    return CancellablePromise.from(when).thenCancellable(() => this.audio!);
  }
}
