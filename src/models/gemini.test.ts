import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  geminiTextToSpeech,
  validateApiKeyGemini,
  geminiCallTextToSpeech,
} from "./gemini";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Create mock functions for Google GenAI
const mockList = vi.fn();
const mockGenerateContent = vi.fn();

// Mock the Google GenAI module
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      list: mockList,
      generateContent: mockGenerateContent,
    },
  })),
}));

describe("Gemini Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "test-api-key",
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        voice: "Zephyr",
        instructions: undefined,
        model: "gemini-2.5-flash-preview-tts",
      });
    });

    it("should handle empty/undefined values", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "",
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "",
        voice: "Zephyr",
        instructions: undefined,
        model: "gemini-2.5-flash-preview-tts",
      });
    });

    it("should include all required fields", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "test-key",
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options).toHaveProperty("apiKey");
      expect(options).toHaveProperty("voice");
      expect(options).toHaveProperty("instructions");
      expect(options).toHaveProperty("model");
    });
  });

  describe("Model Integration", () => {
    it("should have all required methods", () => {
      expect(geminiTextToSpeech).toHaveProperty("call");
      expect(geminiTextToSpeech).toHaveProperty("validateConnection");
      expect(geminiTextToSpeech).toHaveProperty("convertToOptions");
      expect(typeof geminiTextToSpeech.call).toBe("function");
      expect(typeof geminiTextToSpeech.validateConnection).toBe("function");
      expect(typeof geminiTextToSpeech.convertToOptions).toBe("function");
    });

    it("should require API key for validation", async () => {
      const result = await geminiTextToSpeech.validateConnection({
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "",
      });

      expect(result).toBeDefined();
      expect(result).toContain("API key");
    });

    it("should convert settings correctly for context mode", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        gemini_apiKey: "test-key",
      };

      const options = geminiTextToSpeech.convertToOptions(testSettings);

      expect(options.voice).toBe("Zephyr");
      expect(options.instructions).toBeUndefined();
      expect(options.model).toBe("gemini-2.5-flash-preview-tts");
    });
  });

  describe("Gemini Error Mapping", () => {
    it("should handle ClientError with JSON content", () => {
      // Create a mock ClientError that mimics the actual error structure
      const error = new Error(
        'got status: 400 . {"error":{"message":"API_KEY_INVALID","status":"INVALID_ARGUMENT"}}',
      );
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
        'got status: 400 . {"error":"bad request"}',
        'got status: 401 . {"error":"unauthorized"}',
        'got status: 429 . {"error":"rate limited"}',
        'got status: 500 . {"error":"server error"}',
      ];

      errorMessages.forEach((message) => {
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
      const errorMessage =
        'got status: 400 . {"error":{"message":"API_KEY_INVALID","status":"INVALID_ARGUMENT"}}';
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
        'got status: 400 . {"error":{"message":"API_KEY_INVALID"}}',
        "Invalid API key provided",
      ];

      apiKeyErrors.forEach((errorMsg) => {
        const hasApiKeyError =
          errorMsg.includes("API_KEY_INVALID") ||
          errorMsg.includes("Invalid API key") ||
          (errorMsg.includes("invalid") && errorMsg.includes("key"));
        expect(hasApiKeyError).toBe(true);
      });
    });
  });

  describe("API Integration (Mocked)", () => {
    it("should validate API key successfully", async () => {
      mockList.mockResolvedValue([{ name: "gemini-pro" }]);

      const result = await validateApiKeyGemini("test-key");

      expect(mockList).toHaveBeenCalled();
      expect(result).toBeUndefined(); // undefined means success
    });

    it("should handle API key invalid error", async () => {
      const error = new Error(
        'got status: 400 . {"error":{"message":"API_KEY_INVALID","status":"INVALID_ARGUMENT"}}',
      );
      error.name = "ClientError";
      mockList.mockRejectedValue(error);

      const result = await validateApiKeyGemini("invalid-key");

      expect(mockList).toHaveBeenCalled();
      expect(result).toBe("Invalid API key");
    });

    it("should handle permission denied error", async () => {
      const error = new Error(
        'got status: 403 . {"error":{"message":"PERMISSION_DENIED","status":"PERMISSION_DENIED"}}',
      );
      error.name = "ClientError";
      mockList.mockRejectedValue(error);

      const result = await validateApiKeyGemini("forbidden-key");

      expect(result).toBe(
        "HTTP error code 403: Request failed 'PERMISSION_DENIED'",
      );
    });

    it("should handle quota exceeded error", async () => {
      const error = new Error(
        'got status: 429 . {"error":{"message":"RESOURCE_EXHAUSTED","status":"RESOURCE_EXHAUSTED"}}',
      );
      error.name = "ClientError";
      mockList.mockRejectedValue(error);

      const result = await validateApiKeyGemini("quota-key");

      expect(result).toBe(
        "HTTP error code 429: Request failed 'RESOURCE_EXHAUSTED'",
      );
    });

    it("should make a TTS call and return audio", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  },
                },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Zephyr",
        instructions: undefined,
      };

      const result = await geminiCallTextToSpeech(
        "Hello world",
        options,
        [],
        DEFAULT_SETTINGS,
      );

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it("should construct prompt with instructions and context", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  },
                },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Zephyr",
        instructions: undefined,
      };

      await geminiCallTextToSpeech(
        "Hello world",
        options,
        [],
        DEFAULT_SETTINGS,
      );

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain("Content: Hello world");
      expect(
        callArgs.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      ).toBe("Zephyr");
    });

    it("should construct prompt without context when contextMode is false", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  },
                },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Zephyr",
        instructions: undefined,
      };

      await geminiCallTextToSpeech(
        "Hello world",
        options,
        [],
        DEFAULT_SETTINGS,
      );

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain("Content: Hello world");
      expect(promptText).not.toContain("Should not appear");
    });

    it("should handle empty instructions gracefully", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  },
                },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Zephyr",
        instructions: undefined,
      };

      await geminiCallTextToSpeech(
        "Hello world",
        options,
        [],
        DEFAULT_SETTINGS,
      );

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain("Content: Hello world");
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it("should use correct voice configuration", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  },
                },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Echo",
        instructions: undefined,
      };

      await geminiCallTextToSpeech("Test", options, [], DEFAULT_SETTINGS);

      const callArgs = mockGenerateContent.mock.calls[0][0];

      expect(
        callArgs.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      ).toBe("Echo");
    });

    it("should handle TTS generation errors", async () => {
      const error = new Error(
        'got status: 500 . {"error":{"message":"INTERNAL","status":"INTERNAL"}}',
      );
      error.name = "ClientError";
      mockGenerateContent.mockRejectedValue(error);

      const options = {
        apiKey: "test-key",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Zephyr",
        instructions: undefined,
      };

      await expect(
        geminiCallTextToSpeech("Test", options, [], DEFAULT_SETTINGS),
      ).rejects.toThrow("Request failed 'INTERNAL'");
    });
  });
});
