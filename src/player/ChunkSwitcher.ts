import * as mobx from "mobx";
import { randomId } from "../util/misc";
import { AudioSink } from "./AudioSink";
import { ActiveAudioText } from "./ActiveAudioText";
import { TTSErrorInfo, toModelOptions } from "./TTSModel";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { ChunkLoader } from "./ChunkLoader";

export interface PlayingTrack {
  position: number;
  audio?: ArrayBuffer;
  failed?: boolean;
  failureInfo?: TTSErrorInfo;
}

/**
 * Side car to the active audio text. Contains complex state and track management with lots of events
 * and background tasks. It's convenient to bundle all of this up in a non-public interface, as a means
 * of easily disposing and recreating the state in order to switch models or model parameters seemlessly
 */
export class ChunkSwitcher {
  private activeAudioText: ActiveAudioText;
  private settings: TTSPluginSettings;
  private sink: AudioSink;
  private chunkLoader: ChunkLoader;
  private readerId: string;
  _isPlaying = false;
  private cancelMonitor: () => void;
  active?: PlayingTrack = undefined;
  private isDestroyed = false;

  constructor({
    activeAudioText,
    sink,
    settings,
    chunkLoader: trackLoader,
  }: {
    activeAudioText: ActiveAudioText;
    sink: AudioSink;
    settings: TTSPluginSettings;
    chunkLoader: ChunkLoader;
  }) {
    this.activeAudioText = activeAudioText;
    this.sink = sink;
    this.settings = settings;
    this.chunkLoader = trackLoader;
    this.readerId = randomId();

    mobx.makeObservable(this, {
      active: mobx.observable,
      _isPlaying: mobx.observable,
      _setAudio: mobx.action,
      _activate: mobx.action,
      _onplay: mobx.action,
      _onpause: mobx.action,
    });

    const positionChanger = mobx.reaction(
      () => this.sink.trackStatus,
      () => {
        if (this.sink.trackStatus === "complete") {
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
      () => this.sink.isPlaying,
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

  _setAudio(item: PlayingTrack, audio: ArrayBuffer) {
    item.audio = audio;
  }

  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    this.populateUpcoming();
    const chunk = this.activeAudioText.currentChunk;
    if (!chunk) {
      this._isPlaying = false;
      this.active = undefined;
      return;
    } else if (!chunk.text.trim()) {
      this.activeAudioText.goToNext();
      return;
    } else {
      const item: PlayingTrack = mobx.observable({
        position: this.activeAudioText.position,
        failed: false,
        audio: undefined,
      });
      this.active = item;
      let audio: ArrayBuffer;
      try {
        audio = await this.chunkLoader.load(
          chunk.text,
          toModelOptions(this.settings),
          this.readerId,
        );
      } catch (e) {
        item.failed = true;
        console.error(`Failed to load track '${chunk.text}'`, e);
        if (e instanceof TTSErrorInfo) {
          mobx.runInAction(() => (item.failureInfo = e));
        }
        this._onpause();
        return undefined;
      }
      if (this.isDestroyed) return;

      if (this.active === item) {
        this._setAudio(item, audio);
        await this.sink.switchMedia(audio);
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
          toModelOptions(this.settings),
          this.readerId,
          this.activeAudioText.position + i,
        );
      });
  };

  destroy() {
    this.isDestroyed = true;
    this.cancelMonitor();
    this.chunkLoader.expire(this.readerId);
  }

  _onplay(): void {
    if (this._isPlaying) {
      return;
    }
    this._isPlaying = true;
    if (!this.active || this.active.failed) {
      // start the loop
      this._activate();
    }
  }

  _onpause(): void {
    this._isPlaying = false;
  }
}
