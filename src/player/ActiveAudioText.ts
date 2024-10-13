import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import cleanMarkup from "../util/cleanMarkdown";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { AudioSink } from "./AudioSink";
import { AudioSystem } from "./AudioSystem";
import { ChunkSwitcher } from "./ChunkSwitcher";
import { onMultiTextChanged } from "./onMultiTextChanged";
import { toModelOptions, TTSErrorInfo } from "./TTSModel";
import { voiceHash } from "./TTSPluginSettings";

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
export interface AudioTextChunk {
  /** Text as it appears in the source */
  rawText: string;
  /** Text that will be spoken */
  text: string;

  /** Character index of the start of the text track */
  start: number;
  /** Character index of the end of the text track, exclusive */
  end: number;
  /** The audio for this chunk, if it's been loaded. */
  audio?: ArrayBuffer;
  /** Whether the chunk failed to load */
  failed?: boolean;
  /** Information about why the chunk failed to load */
  failureInfo?: TTSErrorInfo;
}

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
}

export class ActiveAudioTextImpl implements ActiveAudioText {
  audio: AudioText;
  private system: AudioSystem;
  private get settings() {
    return this.system.settings;
  }

  private get sink(): AudioSink {
    return this.system.audioSink;
  }
  private voiceChangeId: mobx.IReactionDisposer;
  queue: ChunkSwitcher;

  // goes to -1 once completed
  position = 0;
  get currentChunk(): AudioTextChunk | null {
    if (this.position < 0) {
      return null;
    }
    return this.audio.chunks[this.position];
  }

  get isPlaying(): boolean {
    return this.sink.isPlaying;
  }

  get isLoading(): boolean {
    return this.queue.active ? !this.queue.active.audio : false;
  }

  get error(): TTSErrorInfo | undefined {
    const isFailed = this.queue.active?.failed;
    if (!isFailed) {
      return undefined;
    }
    const error =
      this.queue.active?.failureInfo ||
      new TTSErrorInfo("unknown", { message: "an unknown error occurred" });
    return error;
  }

  constructor(audio: AudioText, system: AudioSystem) {
    this.audio = audio;
    this.system = system;

    this.initializeQueue();

    mobx.makeObservable(this, {
      isPlaying: computed,
      isLoading: computed,
      position: observable,
      currentChunk: computed,
      error: computed,
      queue: observable,
      destroy: action,
      goToNext: action,
      goToPrevious: action,
      initializeQueue: action,
      onMultiTextChanged: action,
    });

    this.voiceChangeId = mobx.reaction(
      () => voiceHash(toModelOptions(this.settings)),
      this.initializeQueue,
      {
        fireImmediately: false,
      },
    );
  }

  onTextChanged(position: number, type: "add" | "remove", text: string): void {
    onMultiTextChanged([{ position, type, text }], this.audio.chunks);
  }
  onMultiTextChanged(
    changes: { position: number; type: "add" | "remove"; text: string }[],
  ): void {
    onMultiTextChanged(changes, this.audio.chunks);
  }

  initializeQueue = () => {
    this.queue?.destroy();
    this.queue = new ChunkSwitcher({
      activeAudioText: this,
      system: this.system,
    });
  };

  play() {
    this.sink.play();
  }
  pause(): void {
    this.sink.pause();
  }

  destroy(): void {
    this.sink?.pause();
    this.queue?.destroy();
    this.voiceChangeId?.();
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
    const chunk = {
      rawText: s,
      text: cleanMarkup(s),
      // TODO - fixme
      start,
      end,
    };
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
