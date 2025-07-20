import * as mobx from "mobx";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { AudioCache, memoryStorage } from "./AudioCache";
import { AudioSink } from "./AudioSink";
import { AudioStore, loadAudioStore } from "./AudioStore";
import { TTSModel, TTSModelOptions } from "../models/tts-model";
import { DEFAULT_SETTINGS, TTSPluginSettings } from "./TTSPluginSettings";
import { ActiveAudioText } from "./ActiveAudioText";
import { createAudioSystem } from "./AudioSystem";
import { AudioTextOptions } from "./AudioTextChunk";
import { ChunkLoader } from "./ChunkLoader";
import { FakeAudioSink, createTestModel } from "../components/test-utils";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  debounce: () => vi.fn(),
}));

describe("AudioStore", () => {
  let store: AudioStore;

  beforeEach(() => {
    store = createStore();
  });
  afterEach(() => {
    store?.closePlayer();
  });

  test("should add and play", async () => {
    const text = "later tater";

    const txt = await store.startPlayer({
      text,
      filename: "potatoes.md",
      start: 0,
      end: text.length,
    });
    expect(txt.audio.filename).toEqual("potatoes.md");
    expect(txt.audio.friendlyName).toEqual("potatoes.md: later tater");
    expect(txt.audio.chunks).toHaveLength(1);
    expect(store.activeText).toEqual(txt);
    expect(store.activeText?.isPlaying).toEqual(true);
  });

  test("should activate", async () => {
    const text = "later tater";
    await store.startPlayer({
      text,
      filename: "potatoes.md",
      start: 0,
      end: text.length,
    });
    const active = store.activeText!;
    expect(active.isPlaying).toEqual(true);
    expect(active.position).toEqual(0);
    expect(active.audio.chunks).toHaveLength(1);
  });

  describe("Active Track", async () => {
    async function createActiveTrack(
      {
        text = "how now brown cow",
        filename = "file.md",
        minChunkLength = 1,
        start = 0,
        end = start + text.length,
      }: Partial<AudioTextOptions> = {},
      deps: MaybeStoreDependencies = {},
    ): Promise<ActiveAudioText> {
      store = createStore(deps);
      const active = await store.startPlayer({
        text,
        filename,
        start,
        end,
        minChunkLength,
      });
      return active;
    }
    test("should play", async () => {
      const active = await createActiveTrack();
      expect(active.isPlaying).toEqual(true);
      active.pause();
      expect(active.isPlaying).toEqual(false);
      active.play();
      expect(active.isPlaying).toEqual(true);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("should load and progress through the tracks to the end", async () => {
      vi.useFakeTimers();
      const duration = 1;
      const sink = new FakeAudioSink({
        getAudioBuffer: (ab: ArrayBuffer): Promise<AudioBuffer> => {
          return Promise.resolve({
            duration,
          } as AudioBuffer);
        },
      });
      const tts = vi.mockObject(createTestModel());
      tts.call.mockReturnValue(Promise.resolve(new ArrayBuffer(0)));
      tts.convertToOptions = vi.fn().mockReturnValue({
        model: "gpt-4o-mini-tts",
        voice: "shimmer",
        contextMode: false,
      });
      const text =
        "First there was one bottle top. Then there were two bottle tops. Penultimately there were three bottle tops. Finally there were four bottle tops.";
      const active = await createActiveTrack(
        {
          text,
          filename: "file.md",
        },
        { audioSink: sink, textToSpeech: tts },
      );
      expect(active.position).toEqual(0);
      active.play();
      await vi.advanceTimersByTimeAsync(1);
      expect(tts.call.mock.calls.map((call) => call[0])).toEqual([
        "First there was one bottle top. ",
        "Then there were two bottle tops. ",
        "Penultimately there were three bottle tops. ",
      ]);
      sink.currentTime = duration;
      await vi.advanceTimersByTimeAsync(duration * 1000);
      expect(active.position).toEqual(1);
      expect(tts.call.mock.calls.map((call) => call[0])).toEqual([
        "First there was one bottle top. ",
        "Then there were two bottle tops. ",
        "Penultimately there were three bottle tops. ",
        "Finally there were four bottle tops.",
      ]);
      expect(active.isPlaying).toEqual(true);
      sink.currentTime = duration * 2;
      await vi.advanceTimersByTimeAsync(duration * 1000);
      expect(tts.call.mock.calls.map((call) => call[0])).toHaveLength(4);
      expect(active.position).toEqual(2);
      sink.currentTime = duration * 3;
      await vi.advanceTimersByTimeAsync(duration * 1000);
      expect(active.position).toEqual(3);
      sink.currentTime = duration * 4;
      await vi.advanceTimersByTimeAsync(duration * 1000);
      expect(active.position).toEqual(-1);
      expect(active.isPlaying).toEqual(false);
    });

    test("should switch out the queue when the settings change", async () => {
      const tts = vi.mockObject(createTestModel());
      tts.call.mockReturnValue(Promise.resolve(new ArrayBuffer(0)));
      tts.validateConnection = vi.fn().mockResolvedValue(undefined);
      tts.convertToOptions = vi
        .fn()
        .mockImplementation((settings: TTSPluginSettings): TTSModelOptions => {
          return {
            model: settings.openai_ttsModel,
            voice: settings.openai_ttsVoice,
            contextMode: false,
          };
        });
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
          audioSink: new FakeAudioSink({
            getAudioBuffer: async (ab: ArrayBuffer) =>
              ({ duration: 5 }) as AudioBuffer,
          }),
        },
      );
      await waitForPassing(async () => {
        expect(tts.call.mock.calls.length).toEqual(3);
      });
      mobx.runInAction(() => {
        settings.openai_ttsVoice = "onyx";
      });
      expect(store.activeText?.position).toEqual(0);
      await waitForPassing(async () => {
        expect(tts.call.mock.calls.length).toEqual(6);
      });
      expect(
        tts.call.mock.calls.map((call) => call[1]?.voice || "shimmer"),
      ).toEqual(["shimmer", "shimmer", "shimmer", "onyx", "onyx", "onyx"]);
    });

    test("track switching should remain timely when playback rate changes", async () => {
      vi.useFakeTimers();
      const duration = 5;
      const sink = new FakeAudioSink({
        getAudioBuffer: async () => ({ duration }) as AudioBuffer,
      });
      const settings = mobx.observable({ ...DEFAULT_SETTINGS });
      const text = "First chunk. Second chunk. Third chunk. Fourth chunk.";
      const aat = await createActiveTrack(
        { text, filename: "test.md" },
        { audioSink: sink, ttsSettings: settings },
      );

      expect(aat.audio.chunks.length).toBeGreaterThan(1);

      aat.play();
      expect(aat.position).toBe(0);

      // Set playback rate to 2x
      sink.setRate(2);

      // Advance time by half the duration (2.5 seconds)
      sink.currentTime = duration;
      await vi.advanceTimersByTimeAsync((duration / 2) * 1000);

      // Expect to be on the second chunk due to 2x speed
      expect(aat.position).toBe(1);

      // Set playback rate back to 1x
      sink.setRate(1);

      // Advance time by another full duration (5 seconds)
      sink.currentTime += duration;
      await vi.advanceTimersByTimeAsync(duration * 1000);

      // Expect to be on the third chunk
      expect(aat.position).toBe(2);
    });

    test("should reset audio after current track finishes when text in next track is edited", async () => {
      vi.useFakeTimers();
      const duration = 5;
      const tts = vi.mockObject(createTestModel());
      tts.call.mockReturnValue(Promise.resolve(new ArrayBuffer(0)));
      tts.convertToOptions = vi.fn().mockReturnValue({
        model: "gpt-4o-mini-tts",
        voice: "shimmer",
        contextMode: false,
      });
      const sink = new FakeAudioSink({
        getAudioBuffer: async () => ({ duration }) as AudioBuffer,
      });

      const text = "First sentence. Second sentence. Third sentence.";
      const aat = await createActiveTrack(
        { text, filename: "test.md", minChunkLength: 1 },
        { audioSink: sink, textToSpeech: tts },
      );

      expect(aat.audio.chunks.length).toBe(3);

      // Start playing from the first chunk
      aat.play();
      await vi.advanceTimersByTimeAsync(0);
      expect(aat.position).toBe(0);
      // Edit text in the third chunk
      const editPosition = aat.audio.chunks[2].start;
      aat.onTextChanged(editPosition, "add", "New ");

      // wait a tick
      await vi.advanceTimersByTimeAsync(1);
      expect(tts.call.mock.calls.length).toEqual(3);
      // Advance time to finish the first chunk
      sink.currentTime = duration;
      await vi.advanceTimersByTimeAsync(5000);

      // Verify that all audio is reset immediately after the first chunk finishes
      expect(aat.position).toBe(1);
      // Verify that the text has been updated in the third chunk
      expect(aat.audio.chunks[2].rawText).toContain("New ");

      expect(tts.call.mock.calls.length).toEqual(4);
      expect(tts.call.mock.calls[3][0]).toMatch(/^New /);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initialTracks = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length, "add", added);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initialTracks = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length + b.length, "add", added);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initialTracks = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length + b.length + 1, "add", added);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initialTracks = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length - removed.length, "remove", removed);
      const removedChars = removed.length * -1;
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initialTracks = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length + b.length, "remove", removed);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initial = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length, "remove", b);
      aat.onTextChanged(start + a.length, "add", b);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initial = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length, "remove", removed);
      aat.onTextChanged(start + a.length, "add", added);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initial = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length, "remove", b);
      aat.onTextChanged(start + a.length, "add", b);
      const tracks = mobx.toJS(aat.audio.chunks);
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
      const initial = mobx.toJS(aat.audio.chunks);
      aat.onTextChanged(start + a.length, "remove", b);
      aat.onTextChanged(start, "remove", startOfA);
      const tracks = mobx.toJS(aat.audio.chunks);
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
});

interface MaybeStoreDependencies {
  textToSpeech?: TTSModel;
  storage?: AudioCache;
  audioSink?: AudioSink;
  ttsSettings?: TTSPluginSettings;
}
function createStore({
  storage = memoryStorage(),
  audioSink = new FakeAudioSink(),
  textToSpeech = createTestModel(),
  ttsSettings = DEFAULT_SETTINGS,
}: MaybeStoreDependencies = {}): AudioStore {
  const system = createAudioSystem({
    storage: () => storage,
    audioSink: () => audioSink,
    ttsModel: () => textToSpeech,
    settings: () => ttsSettings,
    config: () => ({
      backgroundLoaderIntervalMillis: 10,
    }),
    audioStore: (sys) => {
      return loadAudioStore({
        system: sys,
      });
    },
    chunkLoader: (sys) => new ChunkLoader({ system: sys }),
  });
  return system.audioStore;
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
