import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTTSActions, TTSActions } from "./TTSActions";
import { AudioStore } from "./AudioStore";
import { TTSPluginSettingsStore } from "./TTSPluginSettings";
import { TTSEditorBridge } from "../codemirror/TTSCodeMirrorCore";

function createMockPlayer(): AudioStore {
  return {
    activeText: null,
    autoScrollEnabled: true,
    startPlayer: vi.fn(),
    closePlayer: vi.fn(),
    exportAudio: vi.fn(),
    destroy: vi.fn(),
    clearStorage: vi.fn(),
    getStorageSize: vi.fn(),
    setAutoScrollEnabled: vi.fn(),
    disableAutoScroll: vi.fn(),
    enableAutoScrollAndScrollToCurrent: vi.fn(),
  };
}

function createMockSettings(
  playbackSpeed: number = 1.0,
): TTSPluginSettingsStore {
  return {
    settings: {
      playbackSpeed,
    },
    setSpeed: vi.fn(),
    updateSettings: vi.fn(),
    updateModelSpecificSettings: vi.fn(),
    checkApiKey: vi.fn(),
  } as unknown as TTSPluginSettingsStore;
}

function createMockBridge(): TTSEditorBridge {
  return {
    playSelection: vi.fn(),
    playDetached: vi.fn(),
    isMobile: vi.fn().mockReturnValue(false),
    openSettings: vi.fn(),
    exportAudio: vi.fn(),
    onTextChanged: vi.fn(),
    destroy: vi.fn(),
    activeEditor: undefined,
    focusedEditor: undefined,
    detachedAudio: false,
  } as unknown as TTSEditorBridge;
}

describe("TTSActions", () => {
  let player: AudioStore;
  let settings: TTSPluginSettingsStore;
  let bridge: TTSEditorBridge;
  let actions: TTSActions;

  beforeEach(() => {
    player = createMockPlayer();
    settings = createMockSettings();
    bridge = createMockBridge();
    actions = createTTSActions(player, settings, bridge);
  });

  describe("playSelection", () => {
    it("should call bridge.playSelection", () => {
      actions.playSelection();
      expect(bridge.playSelection).toHaveBeenCalled();
    });
  });

  describe("playPause", () => {
    it("should call playSelection when no active text", () => {
      actions.playPause();
      expect(bridge.playSelection).toHaveBeenCalled();
    });

    it("should pause when playing", () => {
      const pause = vi.fn();
      player.activeText = {
        isPlaying: true,
        pause,
        play: vi.fn(),
      } as unknown as AudioStore["activeText"];

      actions.playPause();
      expect(pause).toHaveBeenCalled();
    });

    it("should play when paused", () => {
      const play = vi.fn();
      player.activeText = {
        isPlaying: false,
        pause: vi.fn(),
        play,
      } as unknown as AudioStore["activeText"];

      actions.playPause();
      expect(play).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("should call player.destroy", () => {
      actions.stop();
      expect(player.destroy).toHaveBeenCalled();
    });
  });

  describe("next", () => {
    it("should call goToNext on active text", () => {
      const goToNext = vi.fn();
      player.activeText = { goToNext } as unknown as AudioStore["activeText"];

      actions.next();
      expect(goToNext).toHaveBeenCalled();
    });

    it("should not throw when no active text", () => {
      expect(() => actions.next()).not.toThrow();
    });
  });

  describe("previous", () => {
    it("should call goToPrevious on active text", () => {
      const goToPrevious = vi.fn();
      player.activeText = {
        goToPrevious,
      } as unknown as AudioStore["activeText"];

      actions.previous();
      expect(goToPrevious).toHaveBeenCalled();
    });

    it("should not throw when no active text", () => {
      expect(() => actions.previous()).not.toThrow();
    });
  });

  describe("speed controls", () => {
    it("speedUp should increase speed", () => {
      actions.speedUp();
      expect(settings.setSpeed).toHaveBeenCalledWith(1.1);
    });

    it("speedDown should decrease speed", () => {
      actions.speedDown();
      expect(settings.setSpeed).toHaveBeenCalledWith(0.9);
    });

    it("canSpeedUp should return false at max speed", () => {
      settings = createMockSettings(2.5);
      actions = createTTSActions(player, settings, bridge);
      expect(actions.canSpeedUp()).toBe(false);
    });

    it("canSpeedDown should return false at min speed", () => {
      settings = createMockSettings(0.5);
      actions = createTTSActions(player, settings, bridge);
      expect(actions.canSpeedDown()).toBe(false);
    });

    it("speedUp should not increase when at max", () => {
      settings = createMockSettings(2.5);
      actions = createTTSActions(player, settings, bridge);
      actions.speedUp();
      expect(settings.setSpeed).not.toHaveBeenCalled();
    });

    it("speedDown should not decrease when at min", () => {
      settings = createMockSettings(0.5);
      actions = createTTSActions(player, settings, bridge);
      actions.speedDown();
      expect(settings.setSpeed).not.toHaveBeenCalled();
    });
  });

  describe("toggleAutoscroll", () => {
    it("should disable autoscroll when enabled and persist setting", () => {
      player.autoScrollEnabled = true;
      actions.toggleAutoscroll();
      expect(player.disableAutoScroll).toHaveBeenCalled();
      expect(settings.updateSettings).toHaveBeenCalledWith({
        autoScrollPlayerView: false,
      });
    });

    it("should enable autoscroll when disabled and persist setting", () => {
      player.autoScrollEnabled = false;
      actions.toggleAutoscroll();
      expect(player.enableAutoScrollAndScrollToCurrent).toHaveBeenCalled();
      expect(settings.updateSettings).toHaveBeenCalledWith({
        autoScrollPlayerView: true,
      });
    });
  });

  describe("state getters", () => {
    it("isPlaying returns false when no active text", () => {
      expect(actions.isPlaying()).toBe(false);
    });

    it("isPlaying returns true when playing", () => {
      player.activeText = { isPlaying: true } as AudioStore["activeText"];
      expect(actions.isPlaying()).toBe(true);
    });

    it("isPaused returns false when no active text", () => {
      expect(actions.isPaused()).toBe(false);
    });

    it("isPaused returns true when paused", () => {
      player.activeText = { isPlaying: false } as AudioStore["activeText"];
      expect(actions.isPaused()).toBe(true);
    });

    it("hasActiveText returns false when no active text", () => {
      expect(actions.hasActiveText()).toBe(false);
    });

    it("hasActiveText returns true when has active text", () => {
      player.activeText = {} as AudioStore["activeText"];
      expect(actions.hasActiveText()).toBe(true);
    });

    it("currentSpeed returns settings playback speed", () => {
      expect(actions.currentSpeed()).toBe(1.0);
    });

    it("autoscrollEnabled returns player state", () => {
      expect(actions.autoscrollEnabled()).toBe(true);
      player.autoScrollEnabled = false;
      expect(actions.autoscrollEnabled()).toBe(false);
    });
  });
});
