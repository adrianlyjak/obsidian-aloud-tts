import { describe, it, expect } from "vitest";
import { openaiLikeTextToSpeech } from "./openai-like";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

describe("OpenAI-Like Model", () => {
  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        openaicompat_apiKey: "test-api-key",
        openaicompat_apiBase: "https://custom-api.example.com",
        openaicompat_ttsModel: "tts-1-hd",
        openaicompat_ttsVoice: "nova",
      };

      const options = openaiLikeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        apiUri: "https://custom-api.example.com",
        model: "tts-1-hd",
        voice: "nova",
        instructions: undefined,
        contextMode: false,
      });
    });

    it("should handle empty/undefined values", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        openaicompat_apiKey: "",
        openaicompat_apiBase: "",
        openaicompat_ttsModel: "",
        openaicompat_ttsVoice: "",
      };

      const options = openaiLikeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "",
        apiUri: "",
        model: "",
        voice: "",
        instructions: undefined,
        contextMode: false,
      });
    });

    it("should use default context mode", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        openaicompat_apiKey: "test-key",
        openaicompat_apiBase: "https://api.example.com",
      };

      const options = openaiLikeTextToSpeech.convertToOptions(testSettings);

      expect(options.contextMode).toBe(false);
    });
  });
}); 