import * as mobx from "mobx";
import { describe, expect, test, vi } from "vitest";
import { AudioCache, memoryStorage } from "./AudioCache";
import { AudioSink, TrackStatus } from "./AudioSink";
import {
  ActiveAudioText,
  AudioStore,
  AudioTextOptions,
  loadAudioStore,
} from "./Player";
import { TTSModel, TTSModelOptions } from "./TTSModel";
import { DEFAULT_SETTINGS, TTSPluginSettings } from "./TTSPluginSettings";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  debounce: () => vi.fn(),
}));

describe("AudioStore", () => {
  test("should add and play", async () => {
    const store = createStore();
    const text = "later tater";
    const txt = store.startPlayer({
      text,
      filename: "potatoes.md",
      start: 0,
      end: text.length,
    });
    expect(txt.audio.filename).toEqual("potatoes.md");
    expect(txt.audio.friendlyName).toEqual("potatoes.md: later tater");
    expect(txt.audio.tracks).toHaveLength(1);
    expect(store.activeText).toEqual(txt);
    expect(store.activeText?.isPlaying).toEqual(true);
  });

  test("should activate", () => {
    const store = createStore();
    const text = "later tater";
    store.startPlayer({
      text,
      filename: "potatoes.md",
      start: 0,
      end: text.length,
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
    const text =
      "First there was one bottle top. Then there were two bottle tops. Eventually there were three bottle tops. Finally there was four.";
    const active = await createActiveTrack(
      {
        text,
        filename: "file.md",
      },
      { audioSink: sink },
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
    expect(active.position).toEqual(-1);
    expect(active.isPlaying).toEqual(false);
  });

  test("should load the 4th track when the 2nd starts", async () => {
    const seen: string[] = [];
    const tts: TTSModel = (text: string, settings: TTSModelOptions) => {
      if (!seen.includes(text)) {
        seen.push(text);
      }
      return fakeTTS(text, settings);
    };
    const text =
      "First there was one star in the sky. Then there were two stars in the sky. Eventually there were three or more stars in the sky. Penultimately there was four. Finally there was five.";
    const active = await createActiveTrack(
      {
        text,
        filename: "file.md",
      },
      {
        textToSpeech: tts,
      },
    );
    expect(active.position).toEqual(0);
    await waitForPassing(async () => {
      expect(seen).toEqual([
        "First there was one star in the sky. ",
        "Then there were two stars in the sky. ",
        "Eventually there were three or more stars in the sky. ",
      ]);
    });
    active.goToNext();
    await waitForPassing(async () => {
      expect(seen).toHaveLength(4);
      expect(seen[3]).toEqual("Penultimately there was four. ");
    });
  });

  test("should switch out the queue when the settings change", async () => {
    const seen: { text: string; settings: TTSModelOptions }[] = [];
    const tts: TTSModel = (text: string, settings: TTSModelOptions) => {
      seen.push({ text, settings });
      return fakeTTS(text, settings);
    };
    const settings = mobx.observable({ ...DEFAULT_SETTINGS });
    const text =
      "First there was one. Then there was two. Eventually there was three. Penultimately there was four. Finally there was five.";
    await createActiveTrack(
      {
        text,
        filename: "file.md",
      },
      {
        textToSpeech: tts,
        ttsSettings: settings,
      },
    );
    mobx.runInAction(() => {
      settings.playbackSpeed = 1.75;
    });
    await waitForPassing(async () => {
      expect(seen).toHaveLength(5);
    });
    expect(seen.map((x) => x.settings.playbackSpeed)).toEqual([
      1, 1, 1.75, 1.75, 1.75,
    ]);
  });

  test("should update the tracks' positions forward when the text is added before", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(15, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].start).toEqual(start + added.length);
    expect(tracks[0].end).toEqual(start + (added + a).length);
    expect(tracks[1].start).toEqual(start + (added + a).length);
    expect(tracks[1].end).toEqual(start + (added + a + b).length);
  });

  test("should update the tracks' positions and text when text is added at the boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual(added + a);
    expect(tracks[0].end).toEqual(start + (added + a).length);
    expect(tracks[1].start).toEqual(start + (added + a).length);
    expect(tracks[1].end).toEqual(start + (added + a + b).length);
  });

  test("should update the tracks' positions and text when text is added after the boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + 1, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual("Ffourirst there was one. ");
    expect(tracks[0].end).toEqual(start + (added + a).length);
    expect(tracks[1].start).toEqual(start + (added + a).length);
    expect(tracks[1].end).toEqual(start + (added + a + b).length);
  });

  test("should update the second track's position when text is added at its leading boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initialTracks = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0]).toEqual(initialTracks[0]);
    expect(tracks[1].start).toEqual(start + a.length);
    expect(tracks[1].rawText).toEqual(added + b);
    expect(tracks[1].end).toEqual(start + (added + a + b).length);
  });

  test("should append text to the final track when text is added at the final boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initialTracks = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length + b.length, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0]).toEqual(initialTracks[0]);
    expect(tracks[1].start).toEqual(initialTracks[1].start);
    expect(tracks[1].rawText).toEqual(b + added);
    expect(tracks[1].end).toEqual(start + (a + b + added).length);
  });

  test("should do nothing when text is added after the final boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const added = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initialTracks = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length + b.length + 1, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toEqual(initialTracks);
  });

  test("should update the tracks' positions backwards when text is removed before", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "four";
    const removedChars = removed.length * -1;
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start - removed.length, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].start).toEqual(start + removedChars);
    expect(tracks[0].end).toEqual(start + removedChars + a.length);
    expect(tracks[1].start).toEqual(start + removedChars + a.length);
    expect(tracks[1].end).toEqual(start + removedChars + (a + b).length);
  });
  test("should update the tracks' positions backwards when text is removed partially at left side", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "abcF";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start - 3, "remove", removed);
    const removedChars = removed.length * -1;
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start - 3);
    expect(tracks[0].rawText).toEqual(a.slice(1));
    expect(tracks[0].end).toEqual(start + removedChars + a.length);
    expect(tracks[1].start).toEqual(start + removedChars + a.length);
    expect(tracks[1].end).toEqual(start + removedChars + (a + b).length);
  });

  test("should update the tracks' positions backwards when text is removed at inner right edge", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "ne. ";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initialTracks = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length - removed.length, "remove", removed);
    const removedChars = removed.length * -1;
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual(a.slice(0, removedChars));
    expect(tracks[0].end).toEqual(start + removedChars + a.length);
    expect(tracks[1].start).toEqual(start + removedChars + a.length);
    expect(tracks[1].rawText).toEqual(initialTracks[1].rawText);
    expect(tracks[1].end).toEqual(start + removedChars + (a + b).length);
  });

  test("should update text of both tracks when text is removed across tracks", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = ". Then";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + a.length - 2, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual(a.slice(0, -2));
    expect(tracks[0].end).toEqual(start + a.length - 2);
    expect(tracks[1].start).toEqual(start + a.length - 2);
    expect(tracks[1].rawText).toEqual(b.slice(4));
    expect(tracks[1].end).toEqual(start + (a + b).length - removed.length);
  });

  test("should update when text is removed within a single track", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "ther";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + 6, "remove", removed);
    const removedChars = removed.length * -1;
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual("First e was one. ");
    expect(tracks[0].end).toEqual(start + removedChars + a.length);
    expect(tracks[1].start).toEqual(start + removedChars + a.length);
    expect(tracks[1].end).toEqual(start + removedChars + (a + b).length);
  });

  test("should update text of final track when partial text is removed after the rightmost boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "wo. ";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + a.length + b.length - 3, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual(a);
    expect(tracks[0].end).toEqual(start + a.length);
    expect(tracks[1].start).toEqual(start + a.length);
    expect(tracks[1].rawText).toEqual(b.slice(0, -3));
    expect(tracks[1].end).toEqual(start - 3 + (a + b).length);
  });

  test("should leave first track alone when next track is trimmed at its start", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "Then";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + a.length, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual(a);
    expect(tracks[0].end).toEqual(start + a.length);
    expect(tracks[1].start).toEqual(start + a.length);
    expect(tracks[1].rawText).toEqual(b.slice(removed.length));
    expect(tracks[1].end).toEqual(start + (a + b).length - removed.length);
  });

  test("should update no text when text is removed entirely after the rightmost boundary", async () => {
    const a = "First there was one. ";
    const b = "Then there was two.";
    const start = 16;
    const removed = "four";
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initialTracks = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length + b.length, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toEqual(initialTracks);
  });

  test("should trim a track to emptiness when a full block of text is removed", async () => {
    const a = "First there was one. ";
    const b = "Then there was two. ";
    const c = "Then there was three. ";
    const start = 16;
    const removed = "one. Then there was two. Then ";
    const aat = await createActiveTrack({
      text: a + b + c,
      start,
      minChunkLength: 1,
    });
    aat.onTextChanged(start + a.length - 5, "remove", removed);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].start).toEqual(start);
    expect(tracks[0].rawText).toEqual("First there was ");
    expect(tracks[0].end).toEqual(start + a.length - 5);
    expect(tracks[1].start).toEqual(start + a.length - 5);
    expect(tracks[1].rawText).toEqual("");
    expect(tracks[1].end).toEqual(start + a.length - 5);
    expect(tracks[2].start).toEqual(start + a.length - 5);
    expect(tracks[2].rawText).toEqual("there was three. ");
    expect(tracks[2].end).toEqual(start + a.length + c.length - 10);
  });
  test("should not add to an empty block", async () => {
    const a = "First there was one. ";
    const b = "Then there was two. ";
    const c = "Then there was three. ";
    const start = 16;
    const aat = await createActiveTrack({
      text: a + b + c,
      start,
      minChunkLength: 1,
    });
    const initial = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length, "remove", b);
    aat.onTextChanged(start + a.length, "add", b);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual(initial[0]);
    expect(tracks[1].start).toEqual(start + a.length);
    expect(tracks[1].rawText).toEqual("");
    expect(tracks[1].end).toEqual(start + a.length);
    expect(tracks[2].start).toEqual(start + a.length);
    expect(tracks[2].rawText).toEqual(b + c);
    expect(tracks[2].end).toEqual(initial[2].end);
  });
  test("should add to an empty block if its the last block", async () => {
    const a = "First there was one. ";
    const b = "Then there was two. ";
    const start = 16;
    const removed = b;
    const added = b;
    const aat = await createActiveTrack({
      text: a + b,
      start,
      minChunkLength: 1,
    });
    const initial = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length, "remove", removed);
    aat.onTextChanged(start + a.length, "add", added);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual(initial[0]);
    expect(tracks[1]).toEqual(initial[1]);
  });
  test("should move empty block forward on add", async () => {
    const a = "First there was one. ";
    const b = "Then there was two. ";
    const c = "Then there was three. ";
    const start = 16;
    const aat = await createActiveTrack({
      text: a + b + c,
      start,
      minChunkLength: 1,
    });
    const initial = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length, "remove", b);
    aat.onTextChanged(start + a.length, "add", b);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual(initial[0]);
    expect(tracks[1].start).toEqual(start + a.length);
    expect(tracks[1].rawText).toEqual("");
    expect(tracks[1].end).toEqual(start + a.length);
    expect(tracks[2].start).toEqual(start + a.length);
    expect(tracks[2].rawText).toEqual(b + c);
    expect(tracks[2].end).toEqual(initial[2].end);
  });

  test("should correctly adjust empty blocks on double removals", async () => {
    const a = "First there was one. ";
    const b = "Then there was two. ";
    const c = "Then there was three. ";
    const start = 16;
    const startOfA = "First ";
    const aat = await createActiveTrack({
      text: a + b + c,
      start,
      minChunkLength: 1,
    });
    const initial = mobx.toJS(aat.audio.tracks);
    aat.onTextChanged(start + a.length, "remove", b);
    aat.onTextChanged(start, "remove", startOfA);
    const tracks = mobx.toJS(aat.audio.tracks);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].start).toEqual(initial[0].start);
    expect(tracks[0].rawText).toEqual("there was one. ");
    expect(tracks[0].end).toEqual(start + a.length - startOfA.length);
    expect(tracks[1].start).toEqual(start + a.length - startOfA.length);
    expect(tracks[1].rawText).toEqual("");
    expect(tracks[1].end).toEqual(start + a.length - startOfA.length);
    expect(tracks[2].start).toEqual(start + a.length - startOfA.length);
    expect(tracks[2].rawText).toEqual(c);
    expect(tracks[2].end).toEqual(start + (a + c).length - startOfA.length);
  });
});

const fakeTTS: TTSModel = async () => {
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
  textToSpeech?: TTSModel;
  storage?: AudioCache;
  audioSink?: AudioSink;
  ttsSettings?: TTSPluginSettings;
}
function createStore({
  storage = memoryStorage(),
  audioSink = new FakeAudioSink(),
  textToSpeech = fakeTTS,
  ttsSettings = DEFAULT_SETTINGS,
}: MaybeStoreDependencies = {}): AudioStore {
  return loadAudioStore({
    settings: ttsSettings,
    textToSpeech: textToSpeech,
    storage: storage,
    audioSink,
    backgroundLoaderIntervalMillis: 10,
  });
}

function createActiveTrack(
  opts: Partial<AudioTextOptions> = {
    text: "how now brown cow",
    filename: "file.md",
  },
  deps: MaybeStoreDependencies = {},
): ActiveAudioText {
  const actualStore = createStore(deps);
  const active = actualStore.startPlayer({
    text: opts.text || "",
    filename: opts.filename || "file.md",
    start: opts.start || 0,
    end: (opts.start || 0) + (opts.text || "").length,
    minChunkLength: opts.minChunkLength,
  });
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
  } = {},
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
            remaining,
          ),
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
