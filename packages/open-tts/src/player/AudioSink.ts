import { CancellablePromise } from "./CancellablePromise";

export type TrackStatus = "playing" | "paused" | "complete";

export interface DecodedAudioData {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Where appended media landed on the playback timeline, in seconds */
export interface AppendedMediaRange {
  start: number;
  end: number;
}

export interface AudioSink {
  /**
   * Indicates whether audio should currently be playing. This can be true
   * while playback is stalled waiting for upstream data.
   */
  readonly isPlaying: boolean;

  currentTime: number;
  readonly trackStatus: TrackStatus;
  readonly bufferedStart: number | undefined;

  play(): void;
  pause(): void;
  restart(): void;
  setRate(rate: number): void;

  clearMedia(): Promise<void>;
  decodeAudioData(audio: ArrayBuffer): Promise<DecodedAudioData>;
  waitForSeeking(): CancellablePromise<void>;
  switchMedia(data: ArrayBuffer): Promise<void>;
  /** Appends media after existing media. Returns the actual timeline range when known. */
  appendMedia(data: ArrayBuffer): Promise<AppendedMediaRange | void>;
  mediaComplete(): Promise<void>;
  destroy(): void;
}
