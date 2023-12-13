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

const ttsSettings: TTSPluginSettings = DEFAULT_SETTINGS;

describe("AudioStore", () => {
  test("should add and play", async () => {
    const storage = memoryStorage();
    const store = createStore(storage);
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

  test("load 3 tracks", async () => {
    const active = await createActiveTrack({
      text: "First there was one. Then there was two. Eventually there was three. Finally there was four.",
      filename: "file.md",
    });
    await waitForPassing(async () => {
      expect(active.audio.tracks[0].audio).toEqual(new ArrayBuffer(0));
      expect(active.audio.tracks[1].audio).toEqual(new ArrayBuffer(0));
      expect(active.audio.tracks[2].audio).toEqual(new ArrayBuffer(0));
    });

    expect(active.audio.tracks[3].audio).toBeUndefined();
  });

  test("should load the 4th track when the 2nd starts", async () => {
    const active = await createActiveTrack({
      text: "First there was one. Then there was two. Eventually there was three. Penultimately there was four. Finally there was five.",
      filename: "file.md",
    });
    expect(active.position).toEqual(0);
    active.goToPosition(1);
    expect(active.position).toEqual(1);
    await waitForPassing(async () => {
      expect(active.audio.tracks[3].audio).toEqual(new ArrayBuffer(0));
    });

    expect(active.audio.tracks[4].audio).toBeUndefined();
  });
});

const fakeTTS = async () => {
  return new ArrayBuffer(0);
};
function createStore(storage: AudioCache = memoryStorage()): AudioStore {
  return loadAudioStore({
    settings: ttsSettings,
    textToSpeech: fakeTTS,
    storage: storage,
  });
}

function createActiveTrack(
  opts: AudioTextOptions = {
    text: "how now brown cow",
    filename: "file.md",
  }
): ActiveAudioText {
  const actualStore = createStore();
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
