import * as mobx from "mobx";
// import { AudioStore } from "./Player";
// import { arrayBufferToBase64 } from "src/util/misc";

export type TrackStatus = "playing" | "paused" | "complete" | "none";

export interface AudioSink {
  /** cancel the current audio and remove references to release resources */
  remove(): void;
  /** Sets an audio track to play */
  setMedia(data: ArrayBuffer): Promise<void>;
  /** play the current audio */
  play(): void;
  /** pause the current audio */
  pause(): void;
  /** move the audio to the beginning of the track */
  restart(): void;
  /** observable for the currently playing track status */
  readonly trackStatus: TrackStatus;
  /** HTML5 Audio stuff, for observing the audio state, like visualization */
  readonly source: AudioNode | undefined;
  readonly context: AudioContext | undefined;
}

export class HTMLAudioSink implements AudioSink {
  current?: AudioSourceManager = undefined;

  constructor() {
    mobx.makeObservable(this, {
      current: mobx.observable,
      play: mobx.action,
      pause: mobx.action,
      restart: mobx.action,
      trackStatus: mobx.computed,
      source: mobx.computed,
      context: mobx.computed,
    });
  }

  get trackStatus(): TrackStatus {
    if (!this.current) {
      return "none";
    } else if (this.current.state.state === "playing") {
      return "playing";
    } else if (this.current.state.state === "complete") {
      return "complete";
    } else {
      return "paused";
    }
  }

  get source(): AudioNode | undefined {
    if (this.current?.state.state === "playing") {
      return this.current.state.source;
    }
  }
  get context(): AudioContext | undefined {
    if (this.current?.state.state === "playing") {
      return this.current.context;
    }
  }

  setMedia(data: ArrayBuffer): Promise<void> {
    this.current?.pause();
    return AudioSourceManager.create(data).then((data) => {
      mobx.runInAction(() => {
        this.current = data;
      });
    });
  }
  play() {
    this.current?.play();
  }
  pause() {
    this.current?.pause();
  }
  restart() {
    this.current?.backToStart();
  }
  remove() {
    this.current?.pause();
    this.current = undefined;
  }
}
// 1. initializing audio data
// 2. prepped, not started
// 3. playing
// -> paused (go to 2)
// 5. complete

type Paused = {
  state: "paused";
  startTime: number;
};

type Playing = {
  state: "playing";
  contextStartTime: number;
  source: AudioBufferSourceNode;
};

type Complete = {
  state: "complete";
};

type AudioState = Paused | Playing | Complete;

class AudioSourceManager {
  context: AudioContext;
  audioData: AudioBuffer;
  state: AudioState;

  static create(data: ArrayBuffer): Promise<AudioSourceManager> {
    const context = new AudioContext();
    const audioData = context.decodeAudioData(data);
    return audioData.then((data) => new AudioSourceManager(context, data));
  }

  constructor(context: AudioContext, audioData: AudioBuffer) {
    this.context = context;
    this.audioData = audioData;
    this.state = {
      state: "paused",
      startTime: 0,
    };
    mobx.makeObservable(this, {
      state: mobx.observable.ref,
      setState: mobx.action,
    });
  }

  setState(state: AudioState) {
    this.state = state;
  }

  play() {
    if (this.state.state === "paused") {
      const ready = this.state as Paused;

      const source = this.context.createBufferSource();
      source.buffer = this.audioData;
      source.connect(this.context.destination);
      source.onended = () => this.setState({ state: "complete" });
      source.start(0, ready.startTime);

      this.setState({
        state: "playing",
        contextStartTime: this.context.currentTime - ready.startTime,
        source,
      });
    }
  }

  pause() {
    if (this.state.state === "playing") {
      const playing: Playing = this.state;
      playing.source.onended = null; // otherwise the completion callback would trigger
      playing.source.stop();
      this.setState({
        state: "paused",
        startTime: this.context.currentTime - playing.contextStartTime,
      });
    }
  }

  backToStart() {
    let wasPlaying = false;
    if (this.state.state === "playing") {
      wasPlaying = true;
      this.pause();
    }
    this.setState({
      state: "paused",
      startTime: 0,
    });
    if (wasPlaying) {
      this.play();
    }
  }
}
