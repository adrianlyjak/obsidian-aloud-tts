import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { openAITextToSpeech } from "./openai";
import { AudioSink, WebAudioSink } from "./AudioSink";
import cleanMarkdown from "src/util/cleanMarkdown";

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
}

/** data to run TTS on */
export interface AudioTextOptions {
  filename: string;
  text: string;
  start: TextPosition;
  end: TextPosition;
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

  start: TextPosition;
  // exlusive?
  end: TextPosition;
}

export interface TextPosition {
  // 0 indexed?
  line: number;
  ch: number;
}

/** Player interface for loading and controlling a track */
export interface ActiveAudioText {
  audio: AudioText;
  readonly isPlaying: boolean;
  readonly isLoading: boolean;
  position: number | -1; // -1 represents complete
  // should be computed.
  currentTrack: AudioTextTrack | null;
  //   position && audio.tracks[position]
  play(): void;
  onTextChanged(
    position: TextPosition,
    type: "add" | "remove",
    text: string,
  ): void;
  pause(): void;
  destroy(): void;
  goToNext(): void;
  goToPrevious(): void;
}

export function loadAudioStore({
  settings,
  storage = memoryStorage(),
  textToSpeech = openAITextToSpeech,
  audioSink = new WebAudioSink(),
}: {
  settings: TTSPluginSettings;
  storage?: AudioCache;
  textToSpeech?: ConvertTextToSpeech;
  audioSink?: AudioSink;
}): AudioStore {
  const store = new AudioStoreImpl(settings, storage, textToSpeech, audioSink);
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  settings: TTSPluginSettings;
  storage: AudioCache;
  textToSpeech: ConvertTextToSpeech;
  sink: AudioSink;

  constructor(
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: ConvertTextToSpeech,
    sink: AudioSink,
  ) {
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    this.sink = sink;
    mobx.makeObservable(this, {
      activeText: observable,
      startPlayer: action,
      closePlayer: action,
    });
    this.initializeBackgroundProcessors();
    return this;
  }

  _backgroundProcesses: { shutdown: () => void }[] = [];
  private initializeBackgroundProcessors(): void {
    // expire storage
    this.storage.expire();
    const expireTimer = setInterval(
      () => {
        this.storage.expire();
      },
      30 * 60 * 1000,
    );
    this._backgroundProcesses.push({
      shutdown: () => {
        clearInterval(expireTimer);
      },
    });
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
    this.sink.remove();
    this._backgroundProcesses.forEach((p) => p.shutdown());
    this._backgroundProcesses = [];
  }
}

class ActiveAudioTextImpl implements ActiveAudioText {
  audio: AudioText;
  private settings: TTSPluginSettings;
  private storage: AudioCache;
  private textToSpeech: ConvertTextToSpeech;
  private sink: AudioSink;
  queue: PewPewQueue;

  // goes to -1 once completed
  position = 0;
  get currentTrack(): AudioTextTrack | null {
    if (this.position < 0) {
      return null;
    }
    return this.audio.tracks[this.position];
  }
  error: string | null = null;

  get isPlaying(): boolean {
    return this.queue.isPlaying;
  }

  get isLoading(): boolean {
    return this.queue.active ? !this.queue.active.audio : false;
  }

  constructor(
    audio: AudioText,
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: ConvertTextToSpeech,
    sink: AudioSink,
  ) {
    this.audio = audio;
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    this.sink = sink;
    this.initializeQueue();

    mobx.makeObservable(this, {
      isPlaying: computed,
      isLoading: computed,
      position: observable,
      currentTrack: computed,
      queue: observable,
      error: observable,
      play: action,
      pause: action,
      destroy: action,
      goToNext: action,
      goToPrevious: action,
      initializeQueue: action,
      onTextChanged: action,
    });

    mobx.reaction(
      () => ({
        speed: this.settings.playbackSpeed,
        voice: this.settings.ttsVoice,
      }),
      this.initializeQueue,
      {
        fireImmediately: false,
        equals: mobx.comparer.structural,
      },
    );
  }

  onTextChanged(
    position: TextPosition,
    type: "add" | "remove",
    text: string,
  ): void {
    const idx = this.audio.tracks.findIndex((x) => {
      const isWithinLine =
        x.start.line >= position.line && x.end.line <= position.line;
      if (!isWithinLine) {
        return false;
      }
      if (position.line === x.start.line && x.start.line == x.end.line) {
        return position.ch >= x.start.ch && position.ch <= x.end.ch;
      } else if (position.line === x.start.line) {
        return position.ch >= x.start.ch;
      } else if (position.line === x.end.line) {
        return position.ch <= x.end.ch;
      } else {
        return true;
      }
    });
    if (idx === -1) {
      return;
    } else {
      const affected = this.audio.tracks.slice(idx);
      const main = affected[0];
      const text = main.rawText;
    }
  }

  initializeQueue = () => {
    const wasPlaying = this.queue?.isPlaying ?? false;
    this.queue?.destroy();
    this.queue?.pause();
    this.queue = new PewPewQueue({
      activeAudioText: this,
      sink: this.sink,
      getTrack: (txt) => this.tryLoadTrack(txt),
      settings: this.settings,
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
    this.sink?.remove();
    this.queue?.destroy();
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

  private onError(error: string): void {
    this.error = error;
  }

  /** non-stateful function (barring layers of caching and API calls) */
  private async loadTrack(track: AudioTextTrack): Promise<ArrayBuffer> {
    // copy the settings to make sure audio isn't stored under under the wrong key
    // if the settings are changed while request is in flight
    const settingsCopy = mobx.toJS(this.settings);
    const stored: ArrayBuffer | null = await this.storage.getAudio(
      track.text,
      settingsCopy,
    );
    if (stored) {
      return stored;
    } else {
      let buff: ArrayBuffer;
      try {
        buff = await this.textToSpeech(settingsCopy, track.text);
      } catch (ex) {
        this.onError(ex.message);
        throw ex;
      }
      await this.storage.saveAudio(track.text, settingsCopy, buff);
      return buff;
    }
  }

  async tryLoadTrack(
    track: AudioTextTrack,
    attempt: number = 0,
    maxAttempts: number = 3,
  ): Promise<ArrayBuffer> {
    try {
      return await this.loadTrack(track);
    } catch (ex) {
      if (attempt >= maxAttempts) {
        throw ex;
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * Math.pow(2, attempt)),
        );
        return await this.tryLoadTrack(track, attempt + 1, maxAttempts);
      }
    }
  }
}

export function buildTrack(
  opts: AudioTextOptions,
  splitMode: "sentence" | "paragraph" = "sentence",
): AudioText {
  const splits =
    splitMode === "sentence"
      ? splitSentences(opts.text, { minLength: 20 })
      : splitParagraphs(opts.text);

  let start = opts.start;
  const tracks = [];
  for (const s of splits) {
    const lines = s.split("\n");
    const endLine = start.line + lines.length - 1;
    const endChar =
      endLine === start.line ? start.ch + s.length : lines.at(-1)!.length;
    const end = { line: endLine, ch: endChar };
    const track = {
      rawText: s,
      text: cleanMarkdown(s),
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

// external dependencies
export interface ConvertTextToSpeech {
  (settings: TTSPluginSettings, text: string): Promise<ArrayBuffer>;
}

export interface AudioCache {
  getAudio(
    text: string,
    settings: TTSPluginSettings,
  ): Promise<ArrayBuffer | null>;
  saveAudio(
    text: string,
    settings: TTSPluginSettings,
    audio: ArrayBuffer,
  ): Promise<void>;
  expire(): Promise<void>;
}

export function memoryStorage(): AudioCache {
  const audios: Record<string, ArrayBuffer> = {};

  function toKey(text: string, settings: TTSPluginSettings): string {
    return [
      settings.model,
      settings.ttsVoice,
      settings.playbackSpeed,
      text,
    ].join("/");
  }
  return {
    async getAudio(
      text: string,
      settings: TTSPluginSettings,
    ): Promise<ArrayBuffer | null> {
      return audios[toKey(text, settings)] || null;
    },
    async saveAudio(
      text: string,
      settings: TTSPluginSettings,
      audio: ArrayBuffer,
    ): Promise<void> {
      audios[toKey(text, settings)] = audio;
    },
    async expire(): Promise<void> {
      // meh
    },
  };
}

interface PewPewTrack {
  position: number;
  voice: string;
  speed: number;
  audio?: ArrayBuffer;
  noContent: boolean;
  failed?: boolean;
}

/** Side car to the active audio. plays track after track, exposing activate track and playing status */
class PewPewQueue {
  private activeAudioText: ActiveAudioText;
  private settings: TTSPluginSettings;
  private sink: AudioSink;
  isPlaying = false;
  private cancelMonitor: () => void;
  private getTrack: (text: AudioTextTrack) => Promise<ArrayBuffer>;
  active?: PewPewTrack = undefined;
  upcoming: PewPewTrack[] = [];
  private isDestroyed = false;

  constructor({
    activeAudioText,
    sink,
    getTrack,
    settings,
  }: {
    activeAudioText: ActiveAudioText;
    sink: AudioSink;
    getTrack: (text: AudioTextTrack) => Promise<ArrayBuffer>;
    settings: TTSPluginSettings;
  }) {
    this.activeAudioText = activeAudioText;
    this.sink = sink;
    this.getTrack = getTrack;
    this.settings = settings;

    mobx.makeObservable(this, {
      active: mobx.observable,
      upcoming: mobx.observable,
      isPlaying: mobx.observable,
      setAudio: mobx.action,
      activate: mobx.action,
      populateUpcoming: mobx.action,
      play: mobx.action,
      pause: mobx.action,
    });

    const positionChanger = mobx.reaction(
      () => this.sink.trackStatus,
      () => {
        if (this.sink.trackStatus === "complete") {
          this.activeAudioText.goToNext();
          if (this.activeAudioText.position === -1) {
            this.isPlaying = false;
          }
        }
      },
    );
    const trackSwitcher = mobx.reaction(
      () => this.activeAudioText.position,
      () => {
        this.activate();
      },
    );
    this.cancelMonitor = () => {
      positionChanger();
      trackSwitcher();
    };
  }

  setAudio(item: PewPewTrack, audio: ArrayBuffer) {
    item.audio = audio;
  }

  async activate() {
    this.populateUpcoming();
    const first = this.upcoming.shift();
    this.active = first;
    if (!this.active) {
      this.isPlaying = false;
    } else {
      await mobx.when(() => !!this.active?.audio);
      if (this.isDestroyed) return;
      await this.sink.setMedia(this.active!.audio!);
      if (this.isPlaying && !this.isDestroyed) {
        this.sink.play();
      }
    }
  }

  populateUpcoming() {
    // ensure upcoming is populated

    const newUpcoming = this.activeAudioText.audio.tracks
      .slice(this.activeAudioText.position, this.activeAudioText.position + 3)
      .map((x, i) => {
        const position = this.activeAudioText.position + i;
        const existing = this.upcoming.find(
          (x) =>
            x.position === position &&
            x.voice === this.settings.ttsVoice &&
            x.speed === this.settings.playbackSpeed,
        );
        if (existing && !existing.failed) {
          return existing;
        } else {
          const noContent = !x.text.trim();
          const track: PewPewTrack = mobx.observable({
            position,
            voice: this.settings.ttsVoice,
            speed: this.settings.playbackSpeed,
            noContent,
          });
          if (!noContent) {
            this.getTrack(x)
              .then((audio) => {
                this.setAudio(track, audio);
              })
              .catch((ex) => {
                console.error("failed to get audio", ex);
                mobx.runInAction(() => (track.failed = true));
              });
          }
          return track;
        }
      });
    this.upcoming = newUpcoming;
  }

  destroy() {
    this.isDestroyed = true;
    this.cancelMonitor();
  }

  play(): void {
    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;
    if (this.active) {
      // resume
      this.sink.play();
    } else {
      // start the loop
      this.activate();
    }
  }

  pause(): void {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.sink.pause();
    }
  }
}
