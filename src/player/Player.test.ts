import { test, describe, expect } from "vitest";
import {
  ActiveAudioText,
  AudioCache,
  AudioStore,
  AudioTextOptions,
  loadAudioStore,
  memoryStorage,
} from "./Player";
import { DEFAULT_SETTINGS, TTSPluginSettings } from "./TTSPluginSettings";
import { AudioSink, TrackStatus } from "./AudioSink";
import * as mobx from "mobx";

const ttsSettings: TTSPluginSettings = DEFAULT_SETTINGS;

describe("AudioStore", () => {
  test("should add and play", async () => {
    const store = createStore();
    const txt = store.startPlayer({
      text: "later tater",
      filename: "potatoes.md",
    });
    expect(txt.audio.filename).toEqual("potatoes.md");
    expect(txt.audio.friendlyName).toEqual("potatoes.md: later tater");
    expect(txt.audio.tracks).toHaveLength(1);
    expect(store.activeText).toEqual(txt);
    expect(store.activeText?.isPlaying).toEqual(true);
  });

  test("should activate", () => {
    const store = createStore();
    store.startPlayer({
      text: "later tater",
      filename: "potatoes.md",
    });
    const active = store.activeText!;
    expect(active.isPlaying).toEqual(true);
    expect(active.position).toEqual(0);
    expect(active.audio.tracks).toHaveLength(1);
  });
});

describe("Active Track", async () => {
  test("should play", async () => {
    const active = await createActiveTrack();
    expect(active.isPlaying).toEqual(true);
    active.pause();
    expect(active.isPlaying).toEqual(false);
    active.play();
    expect(active.isPlaying).toEqual(true);
  });

  test("should switch tracks", async () => {
    const sink = new FakeAudioSink();
    const active = await createActiveTrack(
      {
        text: "First there was one. Then there was two. Eventually there was three. Finally there was four.",
        filename: "file.md",
      },
      { audioSink: sink }
    );
    expect(active.position).toEqual(0);
    active.play();
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(true));
    sink.setComplete();
    expect(active.position).toEqual(1);
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(false));
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(true));
    sink.setComplete();
    expect(active.position).toEqual(2);
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(false));
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(true));
    sink.setComplete();
    expect(active.position).toEqual(3);
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(false));
    await waitForPassing(async () => expect(sink.isPlaying).toEqual(true));
    sink.setComplete();
    expect(active.position).toEqual(3);
    expect(active.isPlaying).toEqual(false);
  });

  test("should load the 4th track when the 2nd starts", async () => {
    const seen: string[] = [];
    const tts = (settings: TTSPluginSettings, text: string) => {
      seen.push(text);
      return fakeTTS();
    };
    const active = await createActiveTrack(
      {
        text: "First there was one. Then there was two. Eventually there was three. Penultimately there was four. Finally there was five.",
        filename: "file.md",
      },
      {
        textToSpeech: tts,
      }
    );
    expect(active.position).toEqual(0);
    expect(seen).toEqual([
      "First there was one. ",
      "Then there was two. ",
      "Eventually there was three. ",
    ]);
    active.goToPosition(1);
    await waitForPassing(async () => {
      expect(seen).toHaveLength(4);
      expect(seen[3]).toEqual("Penultimately there was four. ");
    });
  });
});

const fakeTTS = async () => {
  return new ArrayBuffer(0);
};

class FakeAudioSink implements AudioSink {
  currentData: ArrayBuffer | undefined = undefined;
  isPlaying: boolean = false;
  isComplete: boolean = false;
  constructor() {
    mobx.makeObservable(this, {
      currentData: mobx.observable,
      isPlaying: mobx.observable,
      isComplete: mobx.observable,
      setMedia: mobx.action,
      play: mobx.action,
      pause: mobx.action,
      setComplete: mobx.action,
      trackStatus: mobx.computed,
    });
  }

  setComplete(): void {
    this.isComplete = true;
    this.isPlaying = false;
  }
  remove(): void {}
  async setMedia(data: ArrayBuffer): Promise<void> {
    this.isComplete = false;
    this.isPlaying = false;
    this.currentData = data;
  }
  play(): void {
    this.isPlaying = true;
  }
  pause(): void {
    this.isPlaying = false;
  }
  restart(): void {}
  get trackStatus(): TrackStatus {
    const derivedStatus = (): TrackStatus => {
      if (this.isComplete) {
        return "complete";
      } else if (!this.currentData) {
        return "none";
      } else if (this.isPlaying) {
        return "playing";
      } else {
        return "paused";
      }
    };
    return derivedStatus();
  }
  source: AudioNode | undefined;
  context: AudioContext | undefined;
}

interface MaybeStoreDependencies {
  textToSpeech?: (
    settings: TTSPluginSettings,
    text: string
  ) => Promise<ArrayBuffer>;
  storage?: AudioCache;
  audioSink?: AudioSink;
}
function createStore({
  storage = memoryStorage(),
  audioSink = new FakeAudioSink(),
  textToSpeech = fakeTTS,
}: MaybeStoreDependencies = {}): AudioStore {
  return loadAudioStore({
    settings: ttsSettings,
    textToSpeech,
    storage: storage,
    audioSink,
  });
}

function createActiveTrack(
  opts: AudioTextOptions = {
    text: "how now brown cow",
    filename: "file.md",
  },
  deps: MaybeStoreDependencies = {}
): ActiveAudioText {
  const actualStore = createStore(deps);
  const active = actualStore.startPlayer(opts);
  return active;
}

async function waitForPassing(
  fn: () => Promise<void>,
  {
    timeout = 100,
    interval = 10,
  }: {
    timeout?: number;
    interval?: number;
  } = {}
) {
  const start = new Date().valueOf();
  let lastErr;
  let passed: number;
  while ((passed = new Date().valueOf() - start) < timeout) {
    try {
      const remaining = timeout - passed;
      await Promise.race([
        fn(),
        new Promise((res, rej) =>
          setTimeout(
            () => rej(new Error("timeout of " + timeout + "ms exceeded")),
            remaining
          )
        ),
      ]);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  throw lastErr;
}
