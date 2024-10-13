import * as mobx from "mobx";
import { randomId } from "../util/misc";
import { ActiveAudioText } from "./ActiveAudioText";
import { TTSErrorInfo, toModelOptions } from "./TTSModel";
import { ChunkLoader } from "./ChunkLoader";
import { AudioSystem } from "./AudioSystem";

/**
 * Side car to the active audio text. Contains complex state and track management with lots of events
 * and background tasks. It's convenient to bundle all of this up in a non-public interface, as a means
 * of easily disposing and recreating the state in order to switch models or model parameters seemlessly
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
        mobx.runInAction(() => {
          currentChunk.loading = true;
        });
        audio = await this.chunkLoader.load(
          chunk.text,
          toModelOptions(this.system.settings),
          this.readerId,
        );
      } catch (e) {
        console.error(`Failed to load track '${chunk.text}'`, e);
        mobx.runInAction(() => {
          currentChunk.failed = true;
          if (e instanceof TTSErrorInfo) {
            mobx.runInAction(() => (currentChunk.failureInfo = e));
          }
          currentChunk.loading = false;
        });

        this._onpause();
        return undefined;
      }
      if (this.isDestroyed) return;

      if (this.activeAudioText.currentChunk === currentChunk) {
        mobx.runInAction(() => {
          currentChunk.audio = audio;
          currentChunk.loading = false;
        });
        await this.system.audioSink.switchMedia(audio);
      } else {
        mobx.runInAction(() => {
          currentChunk.loading = false;
        });
      }
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
