import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { AudioSystem } from "./AudioSystem";
import { ChunkPlayer } from "./ChunkPlayer";
import { onMultiTextChanged } from "./onMultiTextChanged";
import { TTSErrorInfo } from "../models/tts-model";
import { AudioText, AudioTextChunk, AudioTextOptions } from "./AudioTextChunk";

export interface TextEdit {
  position: number;
  type: "add" | "remove";
  text: string;
}
/** Player interface for loading and controlling a track */
export interface ActiveAudioText {
  audio: AudioText;
  queue: ChunkPlayer | undefined;
  isPlaying: boolean;
  isLoading: boolean;
  error: TTSErrorInfo | undefined;
  position: number;
  lastPositionChange: number;
  currentChunk: AudioTextChunk | null;

  play(): void;
  pause(): void;
  destroy(): void;
  goToNext(): void;
  goToPrevious(): void;
  setPosition(position: number): void;
  onTextChanged(position: number, type: "add" | "remove", text: string): void;
  onMultiTextChanged(
    changes: { position: number; type: "add" | "remove"; text: string }[],
  ): void;
}

export class ActiveAudioTextImpl implements ActiveAudioText {
  audio: AudioText;
  private system: AudioSystem;

  private playReaction: mobx.IReactionDisposer;
  queue: ChunkPlayer | undefined = undefined;

  // goes to -1 once completed
  position = 0;
  lastPositionChange = Date.now();
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
      new TTSErrorInfo("unknown", {
        error: {
          message: "an unknown error occurred",
          type: "unknown",
          code: "unknown",
          param: undefined,
        },
      });
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
      onTextChanged: action,
    });
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
    if (this.position === -1) {
      return;
    }
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
    this.lastPositionChange = Date.now();
  }
}

interface TrackSegment {
  rawText: string;
  /** offset in `opts.text` */
  start: number;
  /** offset in `opts.text` */
  end: number;
  embedded: boolean;
}

/**
 * Splits text into chunk-sized segments. Text from an ![[embed]] is split the
 * same way, but every segment of it is anchored to the embed's range, since the
 * embedded text isn't in the document itself.
 */
function splitIntoSegments(
  opts: AudioTextOptions,
  chunkType: "sentence" | "paragraph",
): TrackSegment[] {
  const split = (text: string): string[] =>
    chunkType === "sentence"
      ? splitSentences(text, { minLength: opts.minChunkLength ?? 20 })
      : splitParagraphs(text, { maxChunkSize: 1000 });
  const segments: TrackSegment[] = [];
  const addText = (from: number, to: number) => {
    let start = from;
    for (const rawText of split(opts.text.slice(from, to))) {
      segments.push({
        rawText,
        start,
        end: start + rawText.length,
        embedded: false,
      });
      start += rawText.length;
    }
  };
  let lastIndex = 0;
  const embeds = [...(opts.embeds ?? [])].sort((a, b) => a.from - b.from);
  for (const embed of embeds) {
    addText(lastIndex, embed.from);
    for (const rawText of split(embed.text)) {
      segments.push({
        rawText,
        start: embed.from,
        end: embed.to,
        embedded: true,
      });
    }
    lastIndex = embed.to;
  }
  addText(lastIndex, opts.text.length);
  return segments;
}

export function buildTrack(
  opts: AudioTextOptions,
  chunkType: "sentence" | "paragraph" = "sentence",
): AudioText {
  const segments = splitIntoSegments(opts, chunkType);
  const splits = segments.map((segment) => segment.rawText);

  const chunks = [];
  for (const segment of segments) {
    const chunk: AudioTextChunk = new AudioTextChunk({
      rawText: segment.rawText,
      start: opts.start + segment.start,
      end: opts.start + segment.end,
      embedded: segment.embedded,
    });
    // Only include chunks that have actual text content after cleaning
    if (chunk.text.trim().length > 0) {
      chunks.push(chunk);
    }
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
