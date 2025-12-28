import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  kokoroTextToSpeech,
  KOKORO_DEFAULT_VOICES,
  clearKokoroInstance,
  isKokoroModelLoaded,
  isKokoroModelLoading,
} from "./kokoro";
import {
  DEFAULT_SETTINGS,
  TTSPluginSettings,
} from "../player/TTSPluginSettings";

// Mock the kokoro-js module
vi.mock("kokoro-js", () => ({
  KokoroTTS: {
    from_pretrained: vi.fn(),
  },
}));

describe("Kokoro TTS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearKokoroInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearKokoroInstance();
  });

  describe("kokoroTextToSpeech", () => {
    describe("convertToOptions", () => {
      it("should convert settings to options correctly", () => {
        const settings: TTSPluginSettings = {
          ...DEFAULT_SETTINGS,
          kokoro_voice: "af_bella",
          kokoro_modelStatus: "ready",
        };

        const options = kokoroTextToSpeech.convertToOptions(settings);

        expect(options.voice).toBe("af_bella");
        expect(options.model).toBe("kokoro-82m");
      });

      it("should use default voice from settings", () => {
        const options = kokoroTextToSpeech.convertToOptions(DEFAULT_SETTINGS);

        expect(options.voice).toBe("af_heart");
        expect(options.model).toBe("kokoro-82m");
      });
    });

    describe("validateConnection", () => {
      it("should return error when model is not downloaded", async () => {
        const settings: TTSPluginSettings = {
          ...DEFAULT_SETTINGS,
          kokoro_modelStatus: "not_downloaded",
        };

        const result = await kokoroTextToSpeech.validateConnection(settings);

        expect(result).toBe(
          "Kokoro model not downloaded. Please download the model first in settings.",
        );
      });

      it("should return error when model is downloading", async () => {
        const settings: TTSPluginSettings = {
          ...DEFAULT_SETTINGS,
          kokoro_modelStatus: "downloading",
        };

        const result = await kokoroTextToSpeech.validateConnection(settings);

        expect(result).toBe(
          "Kokoro model not downloaded. Please download the model first in settings.",
        );
      });

      it("should return undefined when model is ready", async () => {
        const settings: TTSPluginSettings = {
          ...DEFAULT_SETTINGS,
          kokoro_modelStatus: "ready",
        };

        const result = await kokoroTextToSpeech.validateConnection(settings);

        expect(result).toBeUndefined();
      });
    });
  });

  describe("KOKORO_DEFAULT_VOICES", () => {
    it("should have af_heart as the first voice", () => {
      expect(KOKORO_DEFAULT_VOICES[0].value).toBe("af_heart");
    });

    it("should include all voice categories", () => {
      const voices = KOKORO_DEFAULT_VOICES.map((v) => v.value);

      // American female voices (af_*)
      expect(voices.some((v) => v.startsWith("af_"))).toBe(true);
      // American male voices (am_*)
      expect(voices.some((v) => v.startsWith("am_"))).toBe(true);
      // British female voices (bf_*)
      expect(voices.some((v) => v.startsWith("bf_"))).toBe(true);
      // British male voices (bm_*)
      expect(voices.some((v) => v.startsWith("bm_"))).toBe(true);
    });

    it("should have valid label and value for each voice", () => {
      for (const voice of KOKORO_DEFAULT_VOICES) {
        expect(voice.label).toBeTruthy();
        expect(voice.value).toBeTruthy();
        expect(typeof voice.label).toBe("string");
        expect(typeof voice.value).toBe("string");
      }
    });
  });

  describe("model state helpers", () => {
    it("isKokoroModelLoaded should return false initially", () => {
      expect(isKokoroModelLoaded()).toBe(false);
    });

    it("isKokoroModelLoading should return false initially", () => {
      expect(isKokoroModelLoading()).toBe(false);
    });
  });
});
