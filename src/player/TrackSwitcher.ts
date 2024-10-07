import * as mobx from "mobx";
import { randomId } from "../util/misc";
import { AudioSink } from "./AudioSink";
import { ActiveAudioText } from "./Player";
import { TTSErrorInfo, toModelOptions } from "./TTSModel";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { TrackLoader } from "./TrackLoader";

export interface PlayingTrack {
  position: number;
  audio?: ArrayBuffer;
  failed?: boolean;
  failureInfo?: TTSErrorInfo;
}

/** Side car to the active audio. plays track after track, exposing activate track and playing status */
export class TrackSwitcher {
  private activeAudioText: ActiveAudioText;
  private settings: TTSPluginSettings;
  private sink: AudioSink;
  private trackLoader: TrackLoader;
  private readerId: string;
  isPlaying = false;
  private cancelMonitor: () => void;
  active?: PlayingTrack = undefined;
  private isDestroyed = false;

  constructor({
    activeAudioText,
    sink,
    settings,
    trackLoader,
  }: {
    activeAudioText: ActiveAudioText;
    sink: AudioSink;
    settings: TTSPluginSettings;
    trackLoader: TrackLoader;
  }) {
    this.activeAudioText = activeAudioText;
    this.sink = sink;
    this.settings = settings;
    this.trackLoader = trackLoader;
    this.readerId = randomId();

    mobx.makeObservable(this, {
      active: mobx.observable,
      isPlaying: mobx.observable,
      setAudio: mobx.action,
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
            this.isPlaying = false;
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

  setAudio(item: PlayingTrack, audio: ArrayBuffer) {
    item.audio = audio;
  }

  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    this.populateUpcoming();
    const track = this.activeAudioText.currentTrack;
    if (!track) {
      this.isPlaying = false;
      this.active = undefined;
      return;
    } else if (!track.text.trim()) {
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
        audio = await this.trackLoader.load(
          track.text,
          toModelOptions(this.settings),
          this.readerId,
        );
      } catch (e) {
        item.failed = true;
        console.error(`Failed to load track '${track.text}'`, e);
        if (e instanceof TTSErrorInfo) {
          mobx.runInAction(() => (item.failureInfo = e));
        }
        this._onpause();
        return undefined;
      }
      if (this.isDestroyed) return;

      if (this.active === item) {
        this.setAudio(item, audio);
        await this.sink.setMedia(audio);
      }
    }
  }

  /** preload data for upcoming tracks */
  populateUpcoming = () => {
    // somewhat intentional bug-like behavior here. This is non-reactive to user edits on the text.
    // if a user edits some text, this will load the text on demand, rather than upcoming

    this.trackLoader.expireBefore(this.readerId, this.activeAudioText.position);
    this.activeAudioText.audio.tracks
      .filter((x) => !!x.text.trim())
      .slice(this.activeAudioText.position, this.activeAudioText.position + 3)
      .forEach((x, i) => {
        this.trackLoader.preload(
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
    this.trackLoader.expire(this.readerId);
  }

  _onplay(): void {
    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;
    if (!this.active || this.active.failed) {
      // start the loop
      this._activate();
    }
  }

  _onpause(): void {
    this.isPlaying = false;
  }
}
