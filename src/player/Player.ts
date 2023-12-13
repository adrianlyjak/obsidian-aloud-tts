import * as mobx from "mobx";
import { action, computed, observable, reaction } from "mobx";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { randomId, splitParagraphs, splitSentences } from "../util/misc";
import { openAITextToSpeech } from "./openai";

/** High level track changer interface */
export interface AudioStore {
  // observables
  activeText: ActiveAudioText | null;

  // switches the active track
  // returns a track ID
  // starts playing the audio
  startPlayer(opts: AudioTextOptions): ActiveAudioText;

  closePlayer(): void;
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
  // the audio, if loaded
  audio?: ArrayBuffer;
}

/** Player interface for loading and controlling a track */
export interface ActiveAudioText {
  audio: AudioText;
  isPlaying: boolean;
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
}: {
  settings: TTSPluginSettings;
  storage?: AudioCache;
  textToSpeech?: ConvertTextToSpeech;
}): AudioStore {
  const store = new AudioStoreImpl(settings, storage, textToSpeech);
  return store;
}

class AudioStoreImpl implements AudioStore {
  activeText: ActiveAudioText | null = null;
  settings: TTSPluginSettings;
  storage: AudioCache;
  textToSpeech: ConvertTextToSpeech;

  constructor(
    settings: TTSPluginSettings,
    storage: AudioCache,
    textToSpeech: ConvertTextToSpeech
  ) {
    this.settings = settings;
    this.storage = storage;
    this.textToSpeech = textToSpeech;
    mobx.makeObservable(this, {
      activeText: observable,
      startPlayer: action,
      closePlayer: action,
    });
    return this;
  }

  startPlayer(opts: AudioTextOptions): ActiveAudioText {
    const audio: AudioText = buildTrack(opts, this.settings.chunkType);
    this.activeText?.destroy();
    const player = activateText(
      audio,
      this.settings,
      this.storage,
      this.textToSpeech
    );
    this.activeText = player;
    player.play();
    return player;
  }
  closePlayer(): void {
    this.activeText = null;
  }
}

export function activateText(
  audio: AudioText,
  settings: TTSPluginSettings,
  storage: AudioCache,
  textToSpeech: ConvertTextToSpeech
): ActiveAudioText {
  const self = observable(
    {
      audio,
      isPlaying: false,
      position: 0,
      get currentTrack(): AudioTextTrack {
        return audio.tracks[self.position];
      },
      error: null as string | null,
      play: () => {
        self.isPlaying = true;
        self.error = null;
      },
      pause: () => {
        self.isPlaying = false;
      },
      destroy: () => {
        taskQueue = []; // stop jobs from processing
        disableReaction();
      },
      goToPosition: (position: number) => {
        if (position < 0) {
          self.position = 0;
        } else if (position > audio.tracks.length - 1) {
          self.position = 0;
          self.isPlaying = false;
        } else {
          self.position = position;
        }
      },
      onError: (error: string) => {
        self.error = error;
        self.isPlaying = false;
      },
    },
    {
      audio: observable,
      isPlaying: observable,
      position: observable,
      error: observable,
      play: action,
      pause: action,
      goToPosition: action,
      currentTrack: computed,
    }
  );

  let processing: number | undefined;
  let taskQueue = [] as number[];

  async function loadTrack(track: AudioTextTrack): Promise<void> {
    if (track.audio) {
      // nothing to do
    } else {
      let buff: ArrayBuffer | null = await storage.getAudio(
        track.text,
        settings
      );
      if (buff) {
        mobx.runInAction(() => (track.audio = buff || undefined));
      } else {
        buff = await textToSpeech(settings, track.text);
        await storage.saveAudio(track.text, settings, buff);
        mobx.runInAction(() => {
          track.audio = buff || undefined;
        });
      }
    }
  }

  async function loadWithRetry(
    track: AudioTextTrack,
    attempt: number = 0,
    maxAttempts: number = 3
  ): Promise<void> {
    try {
      return await loadTrack(track);
    } catch (ex) {
      if (attempt >= maxAttempts) {
        throw ex;
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * Math.pow(2, attempt))
        );
        await loadWithRetry(track, attempt + 1, maxAttempts);
      }
    }
  }

  async function processQueue() {
    let task: number | undefined;
    while ((task = taskQueue.shift()) !== undefined) {
      processing = task;

      try {
        await loadWithRetry(audio.tracks[task]);
      } catch (ex) {
        // kill the process.
        console.error("failed to load!", ex);
        taskQueue.splice(0, taskQueue.length);
        self.onError("Failed to load track"); // nice to handle network errors more verbosely
      }
      processing = undefined;
    }
  }

  const disableReaction = reaction(
    () => ({
      position: self.position,
      isPlaying: self.isPlaying,
      settings: { model: settings.model, voice: settings.ttsVoice },
    }),
    ({ position, isPlaying, settings }, maybePrevious) => {
      if (!mobx.comparer.structural(settings, maybePrevious?.settings)) {
        // clear out cached audio on model change
        for (const track of audio.tracks) {
          track.audio = undefined;
        }
      }
      if (isPlaying) {
        const start = position;
        taskQueue = [];
        for (let i = 0; i < 3; i++) {
          const index = start + i;
          if (index < self.audio.tracks.length && processing !== i) {
            taskQueue.push(index);
          }
        }
        if (taskQueue.length) {
          if (!processing) processQueue();
        }
      }
    },
    {
      fireImmediately: true,
      equals: mobx.comparer.structural,
    }
  );

  return self;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary: string = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
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
