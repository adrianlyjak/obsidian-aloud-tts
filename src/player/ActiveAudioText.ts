import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { AudioSystem } from "./AudioSystem";
import { ChunkPlayer } from "./ChunkPlayer";
import { onMultiTextChanged } from "./onMultiTextChanged";
import { TTSErrorInfo } from "./TTSModel";
import { AudioText, AudioTextChunk, AudioTextOptions } from "./AudioTextChunk";

export interface TextEdit {
  position: number;
  type: "add" | "remove";
  text: string;
}
/** Player interface for loading and controlling a track */
export interface ActiveAudioText {
  audio: AudioText;
  readonly isPlaying: boolean;
  readonly isLoading: boolean;
  readonly error?: TTSErrorInfo;
  position: number | -1; // -1 represents complete
  readonly currentChunk: AudioTextChunk | null;
  //   position && audio.tracks[position]
  play(): void;
  onTextChanged(position: number, type: "add" | "remove", text: string): void;
  onMultiTextChanged(changes: TextEdit[]): void;
  pause(): void;
  destroy(): void;
  goToNext(): void;
  goToPrevious(): void;
  setPosition(position: number): void;
}

export class ActiveAudioTextImpl implements ActiveAudioText {
  audio: AudioText;
  private system: AudioSystem;

  private playReaction: mobx.IReactionDisposer;
  queue: ChunkPlayer | undefined = undefined;

  // goes to -1 once completed
  position = 0;
  get currentChunk(): AudioTextChunk | null {
    if (this.position < 0) {
      return null;
    }
    return this.audio.chunks[this.position];
  }

  get isPlaying(): boolean {
    return this.system.audioSink.isPlaying;
  }

  get isLoading(): boolean {
    return !!this.currentChunk?.loading;
  }

  get error(): TTSErrorInfo | undefined {
    const isFailed = this.currentChunk?.failed;
    if (!isFailed) {
      return undefined;
    }
    const error =
      this.currentChunk.failureInfo ??
      new TTSErrorInfo("unknown", { message: "an unknown error occurred" });
    return error;
  }

  constructor(audio: AudioText, system: AudioSystem) {
    this.audio = audio;
    this.system = system;

    this.queue = new ChunkPlayer({
      activeAudioText: this,
      system: this.system,
    });

    mobx.makeObservable(this, {
      isPlaying: computed,
      isLoading: computed,
      position: observable,
      error: computed,
      queue: observable,
      destroy: action,
      goToNext: action,
      goToPrevious: action,
      setPosition: action,
      onMultiTextChanged: action,
    });
    (window as any).activeAudioText = this;
  }

  onTextChanged(position: number, type: "add" | "remove", text: string): void {
    onMultiTextChanged([{ position, type, text }], this.audio.chunks);
  }
  onMultiTextChanged(
    changes: { position: number; type: "add" | "remove"; text: string }[],
  ): void {
    onMultiTextChanged(changes, this.audio.chunks);
  }

  play() {
    this.system.audioSink.play();
  }

  pause(): void {
    this.system.audioSink.pause();
  }

  destroy(): void {
    this.system.audioSink?.pause();
    this.queue?.destroy();
    this.playReaction?.();
  }

  goToNext(): void {
    let next = this.position + 1;
    if (next >= this.audio.chunks.length) {
      next = -1;
    }
    this.position = next;
  }

  goToPrevious(): void {
    let next;
    if (this.position == -1) {
      next = this.audio.chunks.length - 1;
    } else {
      next = this.position - 1;
      if (next < 0) {
        next = 0;
      }
    }
    this.position = next;
  }
  setPosition(position: number): void {
    this.position = position;
  }
}

export function buildTrack(
  opts: AudioTextOptions,
  chunkType: "sentence" | "paragraph" = "sentence",
): AudioText {
  const splits =
    chunkType === "sentence"
      ? splitSentences(opts.text, { minLength: opts.minChunkLength ?? 20 })
      : splitParagraphs(opts.text);

  let start = opts.start;
  const chunks = [];
  for (const s of splits) {
    const end = start + s.length;
    const chunk: AudioTextChunk = new AudioTextChunk({
      rawText: s,
      start,
      end,
    });
    start = end;
    chunks.push(chunk);
  }
  return observable({
    id: randomId(),
    filename: opts.filename,
    friendlyName:
      opts.filename +
      ": " +
      splits[0].slice(0, 20) +
      (splits[0].length > 20 ? "..." : ""),
    created: new Date().valueOf(),
    chunks: chunks,
  });
}
