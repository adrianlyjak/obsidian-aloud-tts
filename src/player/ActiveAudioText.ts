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

    // 跳过失败的音频块，但最多跳过5个连续失败的块
    let skipCount = 0;
    while (next < this.audio.chunks.length && skipCount < 5) {
      const chunk = this.audio.chunks[next];
      if (chunk.failed && !chunk.loading) {
        console.warn(
          `跳过失败的音频块 ${next}: "${chunk.text.substring(0, 30)}..."`,
        );
        next++;
        skipCount++;
      } else {
        break;
      }
    }

    if (next >= this.audio.chunks.length) {
      next = -1;
    }

    console.log(
      `从位置 ${this.position} 跳转到 ${next}${skipCount > 0 ? ` (跳过了${skipCount}个失败块)` : ""}`,
    );
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

    // 跳过失败的音频块，但最多跳过5个连续失败的块
    let skipCount = 0;
    while (next >= 0 && skipCount < 5) {
      const chunk = this.audio.chunks[next];
      if (chunk.failed && !chunk.loading) {
        console.warn(
          `向前跳过失败的音频块 ${next}: "${chunk.text.substring(0, 30)}..."`,
        );
        next--;
        skipCount++;
      } else {
        break;
      }
    }

    if (next < 0) {
      next = 0;
    }

    console.log(
      `从位置 ${this.position} 向前跳转到 ${next}${skipCount > 0 ? ` (跳过了${skipCount}个失败块)` : ""}`,
    );
    this.position = next;
  }

  setPosition(position: number): void {
    // 确保位置在有效范围内
    if (position < -1) {
      position = -1;
    } else if (position >= this.audio.chunks.length) {
      position = -1;
    }

    console.log(`设置播放位置: ${this.position} -> ${position}`);
    this.position = position;
  }
}

export function buildTrack(
  opts: AudioTextOptions,
  chunkType: "sentence" | "paragraph" = "sentence",
): AudioText {
  const maxChunkLength = 300; // 设置最大块长度为300字符

  const splits =
    chunkType === "sentence"
      ? splitSentences(opts.text, {
          minLength: opts.minChunkLength ?? 20,
          maxLength: maxChunkLength,
        })
      : splitParagraphs(opts.text);

  let start = opts.start;
  const chunks = [];
  for (const s of splits) {
    // 跳过空白块和无实际内容的块
    if (s.trim().length === 0) continue;

    // 额外检查：确保文本块包含可读内容（不仅仅是标点符号）
    const hasContent = /[\u4e00-\u9fff\w]/.test(s); // 包含中文字符或字母数字
    if (!hasContent) {
      console.log(`跳过无实际内容的文本块: "${s}"`);
      continue;
    }

    const end = start + s.length;
    const chunk: AudioTextChunk = new AudioTextChunk({
      rawText: s,
      start,
      end,
    });
    start = end;
    chunks.push(chunk);
  }

  console.log(
    `文本已分割为 ${chunks.length} 个块，最大块长度限制: ${maxChunkLength} 字符`,
  );

  return observable({
    id: randomId(),
    filename: opts.filename,
    friendlyName:
      opts.filename +
      ": " +
      (opts.text.length > 30 ? opts.text.substring(0, 27) + "..." : opts.text),
    created: new Date().valueOf(),
    chunks: chunks,
  });
}
