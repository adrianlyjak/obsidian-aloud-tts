import * as mobx from "mobx";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSystem } from "./AudioSystem";
import { ChunkLoader } from "./ChunkLoader";
import { toModelOptions } from "./TTSModel";
import { AudioSink } from "./AudioSink";
import { AudioText, AudioTextChunk } from "./AudioTextChunk";
import { TTSPluginSettings } from "./TTSPluginSettings";

/**
 * Effectively the inner loop for the audio text.
 *
 * Is loaded with a track: a piece of observable text chunks from the ActiveAudioText.
 *
 * Once created, it listens for play/pause events from the audio sink. Once playing,
 * it starts a process of pre-loading chunks and acting as a data source for the
 * audio sink.
 *
 */
export class ChunkPlayer {
  private activeAudioText: ActiveAudioText;
  private system: AudioSystem;

  private chunkLoader: ChunkLoader;
  _isPlaying = false;
  private cancelMonitor: () => void;
  private cancelLoop: () => void;
  private isDestroyed = false;

  constructor({
    activeAudioText,
    system,
  }: {
    activeAudioText: ActiveAudioText;
    system: AudioSystem;
  }) {
    this.activeAudioText = activeAudioText;
    this.system = system;

    this.chunkLoader = new ChunkLoader({
      system,
    });

    mobx.makeObservable(this, {
      _isPlaying: mobx.observable,
      _activate: mobx.action,
      _onplay: mobx.action,
      _onpause: mobx.action,
      _clearChunks: mobx.action,
    });

    const playpause = mobx.reaction(
      () => this.system.audioSink.isPlaying,
      (result) => {
        if (result) {
          this._onplay();
        } else {
          this._onpause();
        }
      },
      { fireImmediately: true },
    );
    this.cancelMonitor = () => {
      playpause();
    };
    this.cancelLoop = () => {};
  }

  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    // first, set audio position according to the current playback index, or 0.

    // if position changes externally, interrupt and restart
    // adjust the position as the audio progresses across duration boundaries
    // accept external interrupts
    // if the audio changes, such as when the voice changes, or the text changes,
    // wait until the audio's turn comes before reloading it
    while (this.activeAudioText.isPlaying) {
      const initPosition = this.activeAudioText.position;
      const buffLength = 4;
      // preload 4
      for (let i = 0; i < buffLength; i++) {
        const chunk = this.activeAudioText.audio.chunks[initPosition + i];
        if (chunk?.text.trim()) {
          this.chunkLoader.preload(
            chunk.text,
            toModelOptions(this.system.settings),
            initPosition + i,
          );
        }
      }
      const whenAdvanced = whenCurrentChunkComplete(
        this.activeAudioText,
        this.system.settings,
        this.system.audioSink,
      );
    }

    this._populateUpcoming();
    const chunk = this.activeAudioText.currentChunk;
    if (!chunk) {
      this._isPlaying = false;
      return;
    } else if (!chunk.text.trim()) {
      this.activeAudioText.goToNext();
      return;
    } else {
      let audio: ArrayBuffer;
      const currentChunk = this.activeAudioText.currentChunk;
      if (!currentChunk || currentChunk.loading) {
        return;
      }
      try {
        currentChunk.setLoading();
        audio = await this.chunkLoader.load(
          chunk.text,
          toModelOptions(this.system.settings),
        );
      } catch (e) {
        console.error(`Failed to load track '${chunk.text}'`, e);
        currentChunk.setFailed(e);

        this._onpause();
        return;
      }
      if (
        this.isDestroyed ||
        this.activeAudioText.currentChunk !== currentChunk
      )
        return;

      currentChunk.setLoaded(audio);

      await this.system.audioSink.switchMedia(audio);
      // store decoded audio data for visualization
      this.system.audioSink
        .getAudioBuffer(audio)
        .then((decoded) => {
          currentChunk.setAudioBuffer(decoded);
        })
        .catch((e) => {
          console.error(
            `Failed to decode audio for chunk '${chunk.text}', Visualizations will not work`,
            e,
          );
        });
    }
  }

  /** preload data for upcoming tracks */
  _populateUpcoming = () => {
    // somewhat intentional bug-like behavior here. This is non-reactive to user edits on the text.
    // if a user edits some text, this will load the text on demand, rather than upcoming

    this.chunkLoader.expireBefore(this.activeAudioText.position);
    this.activeAudioText.audio.chunks
      .filter((x) => !!x.text.trim())
      .slice(this.activeAudioText.position, this.activeAudioText.position + 3)
      .forEach((x, i) => {
        this.chunkLoader.preload(
          x.text,
          toModelOptions(this.system.settings),
          this.activeAudioText.position + i,
        );
      });
  };

  destroy() {
    this.isDestroyed = true;
    this.cancelMonitor();
    this.chunkLoader.destroy();
    this._clearChunks();
  }

  _clearChunks() {
    for (const chunk of this.activeAudioText.audio.chunks) {
      chunk.reset();
    }
  }

  _onplay(): void {
    if (this._isPlaying) {
      return;
    }
    this._isPlaying = true;
    // start the loop
    this._activate();
  }

  _onpause(): void {
    this._isPlaying = false;
  }
}

async function whenCurrentChunkComplete(
  audio: ActiveAudioText,
  settings: TTSPluginSettings,
  audioSink: AudioSink,
) {
  const chunk = audio.currentChunk;
  if (!chunk) {
    return;
  }
  await chunk.onceLoaded();

  while (audio.isPlaying) {
    const playingChunks = getSequentialLoadedChunks(audio.audio);
    const index = playingChunks.findIndex((x) => x === chunk);
    if (index === -1 || audio.currentChunk !== chunk) {
      return;
    }
    const duration = playingChunks
      .slice(0, index + 1)
      .reduce((acc, x) => acc + (x.duration || 0), 0);
    const currentTime = audioSink.audio.currentTime;
    const remaining = duration - currentTime;
    if (remaining <= 0) {
      return;
    }
    const speed = settings.playbackSpeed;
    const playbackMultiple = remaining / speed;
    const playbackChanged = mobx.when(() => settings.playbackSpeed !== speed);
    let delay: ReturnType<typeof setTimeout> | undefined = undefined;
    const delayPromise = new Promise(
      (resolve) => (delay = setTimeout(resolve, playbackMultiple)),
    );
    try {
      await Promise.race([playbackChanged, delayPromise]);
    } finally {
      if (delay) {
        clearTimeout(delay);
      }
      playbackChanged.cancel();
    }
  }
}

function getSequentialLoadedChunks(audio: AudioText): AudioTextChunk[] {
  const index = audio.chunks.findIndex(
    (x) => !x.audio && typeof x.duration === "number",
  );
  const fromStart = audio.chunks.slice(index);
  const stop = fromStart.findIndex(
    (x) => !x.audio || typeof x.duration !== "number",
  );
  return fromStart.slice(0, stop);
}

function getPositionAccordingToPlayback(
  audio: AudioText,
  audioSink: AudioSink,
): PlaybackPosition {
  const loaded = getSequentialLoadedChunks(audio);
  if (loaded.length === 0) {
    return { type: "BeforeLoaded" };
  }
  const audioPosition = audioSink.audio.currentTime;
  const start = audio.chunks.indexOf(loaded[0]);
  let running = 0;
  for (let i = 0; i < loaded.length; i++) {
    const chunk = loaded[i];
    running += chunk.duration!;
    if (running >= audioPosition) {
      return { type: "Position", position: start + i };
    }
  }
  return { type: "AfterLoaded" };
}

type PlaybackPosition =
  | { type: "BeforeLoaded" }
  | { type: "AfterLoaded" }
  | { type: "Position"; position: number };
