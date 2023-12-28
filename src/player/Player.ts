import * as mobx from "mobx";
import { action, computed, observable } from "mobx";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { openAITextToSpeech } from "./openai";
import { AudioSink, HTMLAudioSink } from "./AudioSink";

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
}

/** Container for lazily loaded TTS that's text has been chunked for faster streaming of output and seeking of position by chunk */
export interface AudioText {
  id: string;
  filename: string;
  friendlyName: string;
  created: number;
  tracks: AudioTextTrack[];
}

/** An atomic segment of an audio that may or may not yet have been converted to audio and saved to disk  */
export interface AudioTextTrack {
  text: string;
}

/** Player interface for loading and controlling a track */
export interface ActiveAudioText {
  audio: AudioText;
  readonly isPlaying: boolean;
  readonly isLoading: boolean;
  position: number; // TODO - make optional
  // should be computed.
  currentTrack: AudioTextTrack;
  //   position && audio.tracks[position]
  play(): void;
  pause(): void;
  destroy(): void;
  goToPosition(position: number): void;
}

export function loadAudioStore({
  settings,
  storage = memoryStorage(),
  textToSpeech = openAITextToSpeech,
  audioSink = new HTMLAudioSink(),
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
    sink: AudioSink
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
    const expireTimer = setInterval(() => {
      this.storage.expire();
    }, 30 * 60 * 1000);
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
      this.sink
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
  private queue: PewPewQueue;

  position = 0;
  get currentTrack(): AudioTextTrack {
    return this.audio.tracks[this.position];
  }
  error: string | null = null;

  get isPlaying(): boolean {
    return this.queue.isPlaying;
  }

  get isLoading(): boolean {
    return !this.queue.active?.audio;
  }

  constructor(
    audio: AudioText,
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: ConvertTextToSpeech,
    sink: AudioSink
  ) {
    this.audio = audio;
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    this.sink = sink;

    mobx.makeObservable(this, {
      isPlaying: computed,
      isLoading: computed,
      position: observable,
      currentTrack: computed,
      error: observable,
      play: action,
      pause: action,
      destroy: action,
      goToPosition: action,
    });

    this.queue = new PewPewQueue({
      activeAudioText: this,
      sink,
      getTrack: (txt) => this.tryLoadTrack(txt),
      settings,
    });
  }

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
  goToPosition(position: number): void {
    this.position = Math.min(
      Math.max(position, 0),
      this.audio.tracks.length - 1
    ); // note: could maybe allow to overflow by one to represent "finished"
  }

  private onError(error: string): void {
    this.error = error;
  }

  /** non-stateful function (barring layers of caching and API calls) */
  private async loadTrack(track: AudioTextTrack): Promise<ArrayBuffer> {
    const stored: ArrayBuffer | null = await this.storage.getAudio(
      track.text,
      this.settings
    );
    if (stored) {
      return stored;
    } else {
      let buff: ArrayBuffer;
      try {
        buff = await this.textToSpeech(this.settings, track.text);
      } catch (ex) {
        this.onError(ex.message);
        throw ex;
      }
      await this.storage.saveAudio(track.text, this.settings, buff);
      return buff;
    }
  }

  async tryLoadTrack(
    track: AudioTextTrack,
    attempt: number = 0,
    maxAttempts: number = 3
  ): Promise<ArrayBuffer> {
    try {
      return await this.loadTrack(track);
    } catch (ex) {
      if (attempt >= maxAttempts) {
        throw ex;
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * Math.pow(2, attempt))
        );
        return await this.tryLoadTrack(track, attempt + 1, maxAttempts);
      }
    }
  }
}

export function joinTrackText(track: AudioText): string {
  return track.tracks.map((s) => s.text).join("");
}

export function buildTrack(
  opts: AudioTextOptions,
  splitMode: "sentence" | "paragraph" = "sentence"
): AudioText {
  const splits =
    splitMode === "sentence"
      ? splitSentences(opts.text)
      : splitParagraphs(opts.text);
  return observable({
    id: randomId(),
    filename: opts.filename,
    friendlyName:
      opts.filename +
      ": " +
      splits[0].slice(0, 20) +
      (splits[0].length > 20 ? "..." : ""),
    created: new Date().valueOf(),
    tracks: splits.map((s) => ({
      text: s,
      isLoadable: false,
      audio: undefined,
    })),
  });
}

// external dependencies
export interface ConvertTextToSpeech {
  (settings: TTSPluginSettings, text: string): Promise<ArrayBuffer>;
}

export interface AudioCache {
  getAudio(
    text: string,
    settings: TTSPluginSettings
  ): Promise<ArrayBuffer | null>;
  saveAudio(
    text: string,
    settings: TTSPluginSettings,
    audio: ArrayBuffer
  ): Promise<void>;
  expire(): Promise<void>;
}

export function memoryStorage(): AudioCache {
  const audios: Record<string, ArrayBuffer> = {};

  function toKey(text: string, settings: TTSPluginSettings): string {
    return [settings.model, settings.ttsVoice, text].join("/");
  }
  return {
    async getAudio(
      text: string,
      settings: TTSPluginSettings
    ): Promise<ArrayBuffer | null> {
      return audios[toKey(text, settings)] || null;
    },
    async saveAudio(
      text: string,
      settings: TTSPluginSettings,
      audio: ArrayBuffer
    ): Promise<void> {
      audios[toKey(text, settings)] = audio;
    },
    async expire(): Promise<void> {
      // meh
    },
  };
}

interface PewPewTrack {
  text: string;
  position: number;
  voice: string;
  audio?: ArrayBuffer;
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
          if (
            this.activeAudioText.position ===
            this.activeAudioText.audio.tracks.length - 1
          ) {
            this.isPlaying = false;
          } else {
            this.activeAudioText.goToPosition(
              this.activeAudioText.position + 1
            );
          }
        }
      }
    );
    const trackSwitcher = mobx.reaction(
      () => this.activeAudioText.position,
      () => {
        this.activate();
      }
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
      await this.sink.setMedia(this.active!.audio!);
      if (this.isPlaying) {
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
          (x) => x.position === position && x.voice === this.settings.ttsVoice
        );
        if (existing) {
          return existing;
        } else {
          const track = mobx.observable({
            text: x.text,
            position,
            voice: this.settings.ttsVoice,
          }) as PewPewTrack;
          this.getTrack(x).then((audio) => {
            this.setAudio(track, audio);
          });
          return track;
        }
      });
    this.upcoming = newUpcoming;
  }

  destroy() {
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
