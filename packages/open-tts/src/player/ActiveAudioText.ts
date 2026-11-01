import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { AudioSystem } from "./AudioSystem";
import { ChunkPlayer } from "./ChunkPlayer";
import { onMultiTextChanged } from "./onMultiTextChanged";
import { TTSErrorInfo } from "../models/tts-model";
import { AudioText, AudioTextChunk, AudioTextOptions } from "./AudioTextChunk";
import { CleanMarkupOptions } from "../util/cleanMarkdown";

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

/**
 * Splits text into chunks, keeping each obsidian %% comment %% whole so that
 * cleanMarkup sees both of its delimiters.
 */
function splitIntoChunks(
  text: string,
  chunkType: "sentence" | "paragraph",
  minChunkLength: number,
): string[] {
  const splitText = (part: string): string[] =>
    chunkType === "sentence"
      ? splitSentences(part, { minLength: minChunkLength })
      : splitParagraphs(part, { maxChunkSize: 1000 });
  const splits: string[] = [];
  let lastIndex = 0;
  for (const comment of text.matchAll(/%%[\s\S]*?(?:%%|$)/g)) {
    const index = comment.index!;
    if (index > lastIndex) {
      splits.push(...splitText(text.slice(lastIndex, index)));
    }
    splits.push(comment[0]);
    lastIndex = index + comment[0].length;
  }
  if (lastIndex < text.length) {
    splits.push(...splitText(text.slice(lastIndex)));
  }
  return splits;
}

export function buildTrack(
  opts: AudioTextOptions,
  chunkType: "sentence" | "paragraph" = "sentence",
  cleanOptions: CleanMarkupOptions = {},
): AudioText {
  const splits = splitIntoChunks(
    opts.text,
    chunkType,
    opts.minChunkLength ?? 20,
  );

  let start = opts.start;
  const chunks = [];
  for (const s of splits) {
    const end = start + s.length;
    const chunk: AudioTextChunk = new AudioTextChunk({
      rawText: s,
      start,
      end,
      cleanOptions,
    });
    // Only include chunks that have actual text content after cleaning
    if (chunk.text.trim().length > 0) {
      start = end;
      chunks.push(chunk);
    } else {
      // Skip empty chunks but maintain the character position
      start = end;
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
