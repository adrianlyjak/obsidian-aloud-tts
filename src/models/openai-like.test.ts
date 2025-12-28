import { describe, it, expect } from "vitest";
import { openAILikeTextToSpeech } from "./openai-like";
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

      const options = openAILikeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        apiUri: "https://custom-api.example.com",
        model: "tts-1-hd",
        voice: "nova",
        responseFormat: "mp3",
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

      const options = openAILikeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "",
        apiUri: "",
        model: "",
        voice: "",
        responseFormat: "mp3",
      });
    });

    it("should pass through wav response format", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        openaicompat_apiKey: "test-api-key",
        openaicompat_apiBase: "https://custom-api.example.com",
        openaicompat_ttsModel: "tts-1",
        openaicompat_ttsVoice: "alloy",
        openaicompat_responseFormat: "wav" as const,
      };

      const options = openAILikeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        apiUri: "https://custom-api.example.com",
        model: "tts-1",
        voice: "alloy",
        responseFormat: "wav",
      });
    });
  });
});
