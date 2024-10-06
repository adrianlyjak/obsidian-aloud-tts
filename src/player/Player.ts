import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import cleanMarkup from "../util/cleanMarkdown";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { AudioCache, memoryStorage } from "./AudioCache";
import { AudioSink } from "./AudioSink";
import {
  TTSErrorInfo,
  TTSModel,
  openAITextToSpeech,
  toModelOptions,
} from "./TTSModel";
import { TTSPluginSettings, voiceHash } from "./TTSPluginSettings";
import { TrackLoader } from "./TrackLoader";
import { TrackSwitcher } from "./TrackSwitcher";

/** High level track changer interface */
export interface AudioStore {
  // observables
  activeText: ActiveAudioText | null;

  // switches the active track
  // returns a track ID
  // starts playing the audio
  startPlayer(opts: AudioTextOptions): ActiveAudioText;

  closePlayer(): void;

  /**
   * destroys this audio store. Further interaction
   * with the store may not work after calling this
   */
  destroy(): void;

  /** remove all cached audio */
  clearStorage(): Promise<void>;

  /** gets the cache disk usage in bytes */

  getStorageSize(): Promise<number>;
}

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
  tracks: AudioTextTrack[];
}

/** A chunk of the text to be played */
export interface AudioTextTrack {
  /** Text as it appears in the source */
  rawText: string;
  /** Text that will be spoken */
  text: string;

  // character index of the start of the text track
  start: number;
  // character index of the end of the text track, exclusive
  end: number;
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
  // should be computed.
  currentTrack: AudioTextTrack | null;
  //   position && audio.tracks[position]
  play(): void;
  onTextChanged(position: number, type: "add" | "remove", text: string): void;
  onMultiTextChanged(changes: TextEdit[]): void;
  pause(): void;
  destroy(): void;
  goToNext(): void;
  goToPrevious(): void;
}

export function loadAudioStore({
  settings,
  audioSink,
  storage = memoryStorage(),
  textToSpeech = openAITextToSpeech,
  backgroundLoaderIntervalMillis,
}: {
  settings: TTSPluginSettings;
  storage?: AudioCache;
  textToSpeech?: TTSModel;
  audioSink: AudioSink;
  backgroundLoaderIntervalMillis?: number;
}): AudioStore {
  const store = new AudioStoreImpl(settings, storage, textToSpeech, audioSink, {
    backgroundLoaderIntervalMillis,
  });
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  settings: TTSPluginSettings;
  storage: AudioCache;
  textToSpeech: TTSModel;
  sink: AudioSink;
  backgroundLoaderIntervalMillis: number;

  constructor(
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: TTSModel,
    sink: AudioSink,
    {
      backgroundLoaderIntervalMillis = 1000,
    }: {
      backgroundLoaderIntervalMillis?: number;
    } = {},
  ) {
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    this.sink = sink;
    this.backgroundLoaderIntervalMillis = backgroundLoaderIntervalMillis;
    mobx.makeObservable(this, {
      activeText: observable,
      startPlayer: action,
      closePlayer: action,
    });
    this.initializeBackgroundProcessors();
    return this;
  }
  getStorageSize(): Promise<number> {
    return this.storage.getStorageSize();
  }

  _backgroundProcesses: { shutdown: () => void }[] = [];
  private initializeBackgroundProcessors(): void {
    // function, in case duration is changed
    const getExpiryMillis = () => this.settings.cacheDurationMillis;

    // expire on startup
    this.storage.expire(getExpiryMillis());

    let expireTimer: ReturnType<typeof setInterval> | undefined;
    const restartInterval = () => {
      clearInterval(expireTimer);
      const ageInMillis = getExpiryMillis();
      const checkFrequency = ageInMillis / 16;
      // check at most once per minute, and at least once per hour
      const minCheckFrequency = 1000; //* 60;
      const maxCheckFrequency = 1000 * 60; //* 60;
      expireTimer = setInterval(
        () => {
          this.storage.expire(ageInMillis);
        },
        Math.min(
          maxCheckFrequency,
          Math.max(minCheckFrequency, checkFrequency),
        ),
      );
    };

    const cancelReaction = mobx.reaction(
      () => getExpiryMillis(),
      () => restartInterval(),
      {
        fireImmediately: true,
      },
    );

    this._backgroundProcesses.push({
      shutdown: () => {
        cancelReaction();
        clearInterval(expireTimer);
      },
    });
  }

  clearStorage(): Promise<void> {
    return this.storage.expire(0);
  }

  startPlayer(opts: AudioTextOptions): ActiveAudioText {
    const audio: AudioText = buildTrack(opts, this.settings.chunkType);
    this.activeText?.destroy();
    this.activeText = new ActiveAudioTextImpl(
      audio,
      this.settings,
      this.storage,
      this.textToSpeech,
      this.sink,
      {
        backgroundLoaderIntervalMillis: this.backgroundLoaderIntervalMillis,
      },
    );
    this.activeText!.play();
    return this.activeText!;
  }
  closePlayer(): void {
    this.activeText?.destroy();
    this.activeText = null;
  }
  destroy(): void {
    this.closePlayer();
    this.sink.pause();
    this._backgroundProcesses.forEach((p) => p.shutdown());
    this._backgroundProcesses = [];
  }
}

class ActiveAudioTextImpl implements ActiveAudioText {
  audio: AudioText;
  private settings: TTSPluginSettings;
  private sink: AudioSink;
  private voiceChangeId: mobx.IReactionDisposer;
  queue: TrackSwitcher;
  loader: TrackLoader;

  // goes to -1 once completed
  position = 0;
  get currentTrack(): AudioTextTrack | null {
    if (this.position < 0) {
      return null;
    }
    return this.audio.tracks[this.position];
  }

  get isPlaying(): boolean {
    return this.queue.isPlaying;
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

  constructor(
    audio: AudioText,
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: TTSModel,
    sink: AudioSink,
    {
      backgroundLoaderIntervalMillis = 1000,
    }: {
      backgroundLoaderIntervalMillis?: number;
    } = {},
  ) {
    this.audio = audio;
    this.settings = settings;
    this.loader = new TrackLoader({
      ttsModel: textToSpeech,
      audioCache: storage,
      backgroundLoaderIntervalMillis,
    });
    this.sink = sink;
    this.initializeQueue();

    mobx.makeObservable(this, {
      isPlaying: computed,
      isLoading: computed,
      position: observable,
      currentTrack: computed,
      error: computed,
      queue: observable,
      play: action,
      pause: action,
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
    this.onMultiTextChanged([{ position, type, text }]);
  }
  onMultiTextChanged(
    changes: { position: number; type: "add" | "remove"; text: string }[],
  ) {
    for (const { position, type, text } of changes) {
      if (this.audio.tracks.length) {
        // left-most part of the add or delete
        const left = position;
        // right-most part of the add or delete
        const right = position + text.length;
        const end = this.audio.tracks.at(-1)!.end;

        if (type == "add") {
          // this kind of needs to be "smart" about whether the change is inclusive to the range or not
          const isAffected = position <= end;
          if (isAffected) {
            for (const [track, idx] of this.audio.tracks.map(
              (x, i) => [x, i] as const,
            )) {
              const isLast = idx === this.audio.tracks.length - 1;
              const isAddAtVeryEnd = isLast && position === end;
              const isTrackAffected = left < track.end || isAddAtVeryEnd;

              if (isTrackAffected) {
                track.end += text.length;
                if (position < track.start) {
                  track.start += text.length;
                } else {
                  const split = position - track.start;
                  track.rawText =
                    track.text.slice(0, split) + text + track.text.slice(split);
                  track.text = cleanMarkup(track.rawText);
                }
              }
            }
          }
        } else {
          // start or end of the deletion are inside the range
          const isAffected = left < end;
          // or the whole range has been deleted
          if (isAffected) {
            for (const track of this.audio.tracks) {
              let update: Partial<AudioTextTrack> & {
                updateType: "after" | "before" | "left" | "right" | "interior";
              };
              if (track.end <= left) {
                // is completely after
                update = { updateType: "after" };
              } else if (right < track.start) {
                // is completely before
                update = {
                  updateType: "before",
                  start: track.start - text.length,
                  end: track.end - text.length,
                };
              } else if (left <= track.start) {
                // is left side deletion
                const removedBefore = Math.max(0, track.start - left);
                const removed = Math.min(
                  right - Math.max(left, track.start),
                  track.text.length,
                );
                update = {
                  updateType: "left",
                  start: track.start - removedBefore,
                  end: track.end - removed - removedBefore,
                  rawText: track.rawText.slice(removed),
                };
              } else if (left < track.end && track.end <= right) {
                // is right side deletion
                const removed = track.end - left;
                update = {
                  updateType: "right",
                  rawText: track.rawText.slice(0, -removed),
                  end: track.end - removed,
                };
              } else {
                // is interior deletion
                update = {
                  updateType: "interior",
                  end: track.end - (right - left),
                  rawText:
                    track.rawText.slice(0, left - track.start) +
                    track.rawText.slice(right - track.start),
                };
              }
              const { updateType: _, rawText, ...updates } = update;
              // const { updateType, rawText, ...updates } = update;
              // console.log(
              //   `Type: ${updateType} ${rawText ? `'${track.rawText}' -> '${rawText}'` : "[no text change]"}`,
              //   Object.keys(updates).map((x) => {
              //     return `${x}: '${(track as any)[x]}' -> '${(updates as any)[x]}'`;
              //   }),
              // );
              if (rawText !== undefined) {
                track.rawText = rawText;
                track.text = cleanMarkup(rawText);
              }
              Object.assign(track, updates);
            }
          }
        }
      }
    }
  }

  initializeQueue = () => {
    const wasPlaying = this.queue?.isPlaying ?? false;
    this.queue?.destroy();
    this.queue?.pause();
    this.queue = new TrackSwitcher({
      activeAudioText: this,
      sink: this.sink,
      settings: this.settings,
      trackLoader: this.loader,
    });
    if (wasPlaying) {
      this.queue.play();
    }
  };

  play() {
    this.queue.play();
  }
  pause(): void {
    this.queue.pause();
  }

  destroy(): void {
    this.sink?.pause();
    this.queue?.destroy();
    this.loader?.destroy();
    this.voiceChangeId?.();
  }
  goToNext(): void {
    let next = this.position + 1;
    if (next >= this.audio.tracks.length) {
      next = -1;
    }
    this.position = next;
  }

  goToPrevious(): void {
    let next;
    if (this.position == -1) {
      next = this.audio.tracks.length - 1;
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
  splitMode: "sentence" | "paragraph" = "sentence",
): AudioText {
  const splits =
    splitMode === "sentence"
      ? splitSentences(opts.text, { minLength: opts.minChunkLength ?? 20 })
      : splitParagraphs(opts.text);

  let start = opts.start;
  const tracks = [];
  for (const s of splits) {
    const end = start + s.length;
    const track = {
      rawText: s,
      text: cleanMarkup(s),
      // TODO - fixme
      start,
      end,
    };
    start = end;
    tracks.push(track);
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
    tracks: tracks,
  });
}
