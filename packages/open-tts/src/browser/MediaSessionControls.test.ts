import { describe, it, expect, vi } from "vitest";
import * as mobx from "mobx";
import { MediaSessionControls } from "./MediaSessionControls";
import { AudioStore } from "../player/AudioStore";
import { createTTSActions } from "../player/TTSActions";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";

function fakeMediaSession() {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    metadata: null as unknown,
    playbackState: "none" as MediaSessionPlaybackState,
    setActionHandler(action: string, handler: (() => void) | null) {
      if (handler) {
        handlers.set(action, handler);
      } else {
        handlers.delete(action);
      }
    },
  };
}

function loadedText(filename: string, { isPlaying = false } = {}) {
  const setPlaying = (value: boolean) =>
    mobx.runInAction(() => {
      text.isPlaying = value;
    });
  const text = mobx.observable(
    {
      isPlaying,
      position: 0,
      audio: { filename, friendlyName: `${filename}: text` },
      play: vi.fn(() => setPlaying(true)),
      pause: vi.fn(() => setPlaying(false)),
      goToNext: vi.fn(),
      goToPrevious: vi.fn(),
    },
    { play: false, pause: false, goToNext: false, goToPrevious: false },
  );
  return text;
}

/** Another note is focused, as when the loaded text was played elsewhere. */
function setup() {
  const session = fakeMediaSession();
  const player = mobx.observable(
    {
      activeText: null as ReturnType<typeof loadedText> | null,
      destroy: vi.fn(),
    },
    { destroy: false },
  );
  const bridge = { playSelection: vi.fn(), hasOtherTextInFocus: () => true };
  const actions = createTTSActions(
    player as unknown as AudioStore,
    { settings: { playbackSpeed: 1 } } as unknown as TTSPluginSettingsStore,
    bridge,
  );
  const controls = new MediaSessionControls(
    session as unknown as MediaSession,
    player as unknown as AudioStore,
    actions,
  );
  const load = (text: ReturnType<typeof loadedText> | null) =>
    mobx.runInAction(() => {
      player.activeText = text;
    });
  const press = (action: string) => session.handlers.get(action)?.();
  return { session, player, bridge, controls, load, press };
}

describe("MediaSessionControls", () => {
  it("resumes the loaded text from Play, even with another note focused", () => {
    const { bridge, load, press } = setup();
    const text = loadedText("Alias Tests.md");
    load(text);

    press("play");

    expect(text.play).toHaveBeenCalled();
    expect(bridge.playSelection).not.toHaveBeenCalled();
  });

  it("routes Pause, Next, Previous, and Stop through the playback actions", () => {
    const { player, load, press } = setup();
    const text = loadedText("Alias Tests.md", { isPlaying: true });
    load(text);

    press("pause");
    expect(text.pause).toHaveBeenCalled();
    press("nexttrack");
    expect(text.goToNext).toHaveBeenCalled();
    press("previoustrack");
    expect(text.goToPrevious).toHaveBeenCalled();
    press("stop");
    expect(player.destroy).toHaveBeenCalled();
  });

  it("shows the loaded file and whether it's playing", () => {
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(init: MediaMetadataInit) {
          Object.assign(this, init);
        }
      },
    );
    const { session, load, press } = setup();

    load(loadedText("Reading/Alias Tests.md"));
    expect(session.metadata).toMatchObject({
      title: "Alias Tests",
      artist: "Aloud",
    });
    expect(session.playbackState).toBe("paused");

    press("play");
    expect(session.playbackState).toBe("playing");

    load(null);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
    vi.unstubAllGlobals();
  });

  it("leaves media keys to other audio while nothing is loaded", () => {
    const { session, load } = setup();
    expect(session.handlers.size).toBe(0);

    load(loadedText("Alias Tests.md"));
    expect(session.handlers.size).toBeGreaterThan(0);

    load(null);
    expect(session.handlers.size).toBe(0);
  });

  it("removes its handlers when destroyed", () => {
    const { session, controls, load } = setup();
    load(loadedText("Alias Tests.md"));

    controls.destroy();
    expect(session.handlers.size).toBe(0);

    load(loadedText("Embed Tests.md"));
    expect(session.handlers.size).toBe(0);
  });
});
