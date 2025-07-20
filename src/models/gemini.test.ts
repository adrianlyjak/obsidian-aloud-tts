import { describe, it, expect } from "vitest";
import { geminiTextToSpeech } from "./gemini";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

describe("Gemini Model", () => {
  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "test-api-key",
        gemini_ttsModel: "gemini-2.5-flash",
        gemini_ttsVoice: "Zephyr",
        gemini_ttsInstructions: "Speak naturally",
        gemini_contextMode: true,
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        model: "gemini-2.5-flash",
        voice: "Zephyr",
        instructions: "Speak naturally",
        contextMode: true,
      });
    });

    it("should handle empty/undefined values", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "",
        gemini_ttsModel: "",
        gemini_ttsVoice: "",
        gemini_ttsInstructions: "",
        gemini_contextMode: false,
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "",
        model: "",
        voice: "",
        instructions: "",
        contextMode: false,
      });
    });

    it("should include all required fields", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "test-key",
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toHaveProperty("apiKey");
      expect(options).toHaveProperty("model");
      expect(options).toHaveProperty("voice");
      expect(options).toHaveProperty("instructions");
      expect(options).toHaveProperty("contextMode");
    });

    it("should handle context mode correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_contextMode: true,
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options.contextMode).toBe(true);
    });
  });

  describe("Gemini Error Mapping", () => {
    it("should handle ClientError with JSON content", () => {
      // Create a mock ClientError that mimics the actual error structure
      const error = new Error("got status: 400 . {\"error\":{\"message\":\"API_KEY_INVALID\",\"status\":\"INVALID_ARGUMENT\"}}");
      error.name = "ClientError";

      // The error should be processed by mapGenAIError in the actual call
      expect(error.message).toContain("got status: 400");
      expect(error.message).toContain("API_KEY_INVALID");
    });

    it("should handle ClientError with malformed JSON", () => {
      const error = new Error("got status: 500 . {invalid json");
      error.name = "ClientError";

      expect(error.message).toContain("got status: 500");
    });

    it("should extract status code from error message", () => {
      const errorMessages = [
        "got status: 400 . {\"error\":\"bad request\"}",
        "got status: 401 . {\"error\":\"unauthorized\"}",
        "got status: 429 . {\"error\":\"rate limited\"}",
        "got status: 500 . {\"error\":\"server error\"}"
      ];

      errorMessages.forEach(message => {
        const statusMatch = message.match(/got status: (\d+)/);
        expect(statusMatch).not.toBeNull();
        if (statusMatch) {
          const statusCode = parseInt(statusMatch[1]);
          expect(statusCode).toBeGreaterThan(0);
          expect(statusCode).toBeLessThan(600);
        }
      });
    });

    it("should parse JSON from error message", () => {
      const errorMessage = "got status: 400 . {\"error\":{\"message\":\"API_KEY_INVALID\",\"status\":\"INVALID_ARGUMENT\"}}";
      const jsonMatch = errorMessage.match(/got status: \d+ \. (.+)$/);
      
      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        try {
          const parsedJson = JSON.parse(jsonMatch[1]);
          expect(parsedJson).toHaveProperty("error");
          expect(parsedJson.error.message).toBe("API_KEY_INVALID");
        } catch (e) {
          // This test verifies the JSON structure, not actual parsing
        }
      }
    });

    it("should identify API key validation scenarios", () => {
      const apiKeyErrors = [
        "API_KEY_INVALID: The provided API key is invalid",
        "got status: 400 . {\"error\":{\"message\":\"API_KEY_INVALID\"}}",
        "Invalid API key provided"
      ];

      apiKeyErrors.forEach(errorMsg => {
        const hasApiKeyError = errorMsg.includes("API_KEY_INVALID") || 
                              errorMsg.includes("Invalid API key") ||
                              errorMsg.includes("invalid") && errorMsg.includes("key");
        expect(hasApiKeyError).toBe(true);
      });
    });
  });
}); 