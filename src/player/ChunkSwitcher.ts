import * as mobx from "mobx";
import { randomId } from "../util/misc";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSystem } from "./AudioSystem";
import { ChunkLoader } from "./ChunkLoader";
import { toModelOptions } from "./TTSModel";

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
export class ChunkSwitcher {
  private activeAudioText: ActiveAudioText;
  private system: AudioSystem;

  private chunkLoader: ChunkLoader;
  private readerId: string;
  _isPlaying = false;
  private cancelMonitor: () => void;
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
    this.readerId = randomId();

    this.chunkLoader = new ChunkLoader({
      system,
    });
    mobx.makeObservable(this, {
      _isPlaying: mobx.observable,
      _activate: mobx.action,
      _onplay: mobx.action,
      _onpause: mobx.action,
    });

    const positionChanger = mobx.reaction(
      () => this.system.audioSink.trackStatus,
      () => {
        if (this.system.audioSink.trackStatus === "complete") {
          this.activeAudioText.goToNext();
          if (this.activeAudioText.position === -1) {
            this._isPlaying = false;
          }
        }
      },
    );
    const trackSwitcher = mobx.reaction(
      () => this.activeAudioText.position,
      () => {
        this._activate();
      },
    );
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
      positionChanger();
      trackSwitcher();
      playpause();
    };
  }

  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    this.populateUpcoming();
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
          this.readerId,
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
  populateUpcoming = () => {
    // somewhat intentional bug-like behavior here. This is non-reactive to user edits on the text.
    // if a user edits some text, this will load the text on demand, rather than upcoming

    this.chunkLoader.expireBefore(this.readerId, this.activeAudioText.position);
    this.activeAudioText.audio.chunks
      .filter((x) => !!x.text.trim())
      .slice(this.activeAudioText.position, this.activeAudioText.position + 3)
      .forEach((x, i) => {
        this.chunkLoader.preload(
          x.text,
          toModelOptions(this.system.settings),
          this.readerId,
          this.activeAudioText.position + i,
        );
      });
  };

  destroy() {
    this.isDestroyed = true;
    this.cancelMonitor();
    this.chunkLoader.expire(this.readerId);
    this.chunkLoader.destroy();
    mobx.runInAction(() => {
      for (const chunk of this.activeAudioText.audio.chunks) {
        chunk.audioBuffer = undefined;
        chunk.loading = false;
        chunk.audio = undefined;
        chunk.failureInfo = undefined;
        chunk.duration = undefined;
      }
    });
  }

  _onplay(): void {
    if (this._isPlaying) {
      return;
    }
    this._isPlaying = true;
    if (!this.activeAudioText.currentChunk?.loading) {
      // start the loop
      this._activate();
    }
  }

  _onpause(): void {
    this._isPlaying = false;
  }
}
