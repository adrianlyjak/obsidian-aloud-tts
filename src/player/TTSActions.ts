import { AudioStore } from "./AudioStore";
import { TTSPluginSettingsStore } from "./TTSPluginSettings";
import { TTSEditorBridge } from "../codemirror/TTSCodeMirrorCore";

/**
 * Interface for TTS player actions.
 * Pure functions that encapsulate player operations.
 */
export interface TTSActions {
  // Playback control
  playSelection(): void;
  playPause(): void;
  stop(): void;
  next(): void;
  previous(): void;

  // Speed control
  speedUp(): void;
  speedDown(): void;
  canSpeedUp(): boolean;
  canSpeedDown(): boolean;

  // Autoscroll
  toggleAutoscroll(): void;

  // State getters
  isPlaying(): boolean;
  isPaused(): boolean;
  hasActiveText(): boolean;
  currentSpeed(): number;
  autoscrollEnabled(): boolean;
}

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.5;
const SPEED_STEP = 0.1;

/**
 * Creates a TTSActions instance from the audio system components.
 */
export function createTTSActions(
  player: AudioStore,
  settings: TTSPluginSettingsStore,
  bridge: TTSEditorBridge,
): TTSActions {
  return {
    playSelection(): void {
      bridge.playSelection();
    },

    playPause(): void {
      const active = player.activeText;
      if (!active) {
        bridge.playSelection();
      } else if (active.isPlaying) {
        active.pause();
      } else {
        active.play();
      }
    },

    stop(): void {
      player.destroy();
    },

    next(): void {
      player.activeText?.goToNext();
    },

    previous(): void {
      player.activeText?.goToPrevious();
    },

    speedUp(): void {
      const current = settings.settings.playbackSpeed;
      const next = Math.min(MAX_SPEED, current + SPEED_STEP);
      if (next !== current) {
        settings.setSpeed(next);
      }
    },

    speedDown(): void {
      const current = settings.settings.playbackSpeed;
      const next = Math.max(MIN_SPEED, current - SPEED_STEP);
      if (next !== current) {
        settings.setSpeed(next);
      }
    },

    canSpeedUp(): boolean {
      return settings.settings.playbackSpeed < MAX_SPEED;
    },

    canSpeedDown(): boolean {
      return settings.settings.playbackSpeed > MIN_SPEED;
    },

    toggleAutoscroll(): void {
      const newValue = !player.autoScrollEnabled;
      if (newValue) {
        player.enableAutoScrollAndScrollToCurrent();
      } else {
        player.disableAutoScroll();
      }
      // Persist the setting
      settings.updateSettings({ autoScrollPlayerView: newValue });
    },

    isPlaying(): boolean {
      return player.activeText?.isPlaying ?? false;
    },

    isPaused(): boolean {
      return !!player.activeText && !player.activeText.isPlaying;
    },

    hasActiveText(): boolean {
      return !!player.activeText;
    },

    currentSpeed(): number {
      return settings.settings.playbackSpeed;
    },

    autoscrollEnabled(): boolean {
      return player.autoScrollEnabled;
    },
  };
}
