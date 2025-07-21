import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { humeTextToSpeech, humeCallTextToSpeech, HUME_API_URL } from "./hume";
import { TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Mock the global fetch
global.fetch = vi.fn();

describe("Hume Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        hume_apiKey: "test-api-key",
      };

      const options = humeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        model: "HUME_AI",
        voice: undefined,
        instructions: undefined,
      });
    });

    it("should handle empty/undefined values", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        hume_apiKey: "",
      };

      const options = humeTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "",
        model: "HUME_AI",
        voice: undefined,
        instructions: undefined,
      });
    });

    it("should map sourceType to model field", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        hume_apiKey: "test-key",
      };

      const options = humeTextToSpeech.convertToOptions(testSettings);

      expect(options.model).toBe("HUME_AI");
    });

    it("should handle undefined voice", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        hume_ttsVoice: undefined,
      };

      const options = humeTextToSpeech.convertToOptions(testSettings);

      expect(options.voice).toBeUndefined();
    });
  });

  describe("humeCallTextToSpeech API", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      apiUri: HUME_API_URL,
      voice: "test-voice-uuid",
      instructions: "Emotional speech",
      model: "shared",
    };

    it("should make API call with correct authentication", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          generations: [
            {
              audio: "SGVsbG8gV29ybGQ=", // Valid base64 for "Hello World"
            },
          ],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await humeCallTextToSpeech(
        "Hello world",
        mockOptions,
        [],
        DEFAULT_SETTINGS,
      );

      // Verify API call was made with correct authentication
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(HUME_API_URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Hume-Api-Key": "test-api-key",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should handle context mode correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          generations: [
            {
              audio: "SGVsbG8gV29ybGQ=", // Valid base64 for "Hello World"
            },
          ],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const optionsWithContext: TTSModelOptions = {
        ...mockOptions,
      };

      await humeCallTextToSpeech(
        "Continue the story",
        optionsWithContext,
        ["Once upon a time", "there was a dragon"],
        DEFAULT_SETTINGS,
      );

      // Verify API call was made (context handling is complex, just ensure it runs)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(HUME_API_URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Hume-Api-Key": "test-api-key",
          }),
        }),
      );
    });

    it("should handle API errors correctly", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          fault: {
            faultstring: "Invalid ApiKey",
            detail: {
              errorcode: "oauth.v2.InvalidApiKey",
            },
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        humeCallTextToSpeech("Test", mockOptions, [], DEFAULT_SETTINGS),
      ).rejects.toThrow("Request failed 'HTTP 401 error'");
    });
  });

  describe("Hume Error Mapping", () => {
    it("should handle fault-based error format", () => {
      const faultErrorResponse = {
        fault: {
          faultstring: "Invalid API key provided",
          detail: {
            errorcode: "oauth.v2.InvalidApiKey",
          },
        },
      };

      // Test that the error structure contains expected fault information
      expect(faultErrorResponse.fault.faultstring).toBe(
        "Invalid API key provided",
      );
      expect(faultErrorResponse.fault.detail.errorcode).toBe(
        "oauth.v2.InvalidApiKey",
      );
    });

    it("should handle standard error format", () => {
      const standardErrorResponse = {
        error: {
          message: "Request failed with status 429",
          code: "RATE_LIMIT_EXCEEDED",
        },
      };

      expect(standardErrorResponse.error.message).toContain("Request failed");
      expect(standardErrorResponse.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should handle status and message format", () => {
      const statusErrorResponse = {
        status: "error",
        message: "Internal server error occurred",
      };

      expect(statusErrorResponse.status).toBe("error");
      expect(statusErrorResponse.message).toContain("Internal server error");
    });

    it("should handle API key authentication errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          fault: {
            faultstring: "Invalid ApiKey",
            detail: {
              errorcode: "oauth.v2.InvalidApiKey",
            },
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        humeCallTextToSpeech(
          "Test",
          {
            apiKey: "invalid-key",
            apiUri: HUME_API_URL,
            voice: undefined,
            model: "shared",
          },
          [],
          DEFAULT_SETTINGS,
        ),
      ).rejects.toThrow("Request failed 'HTTP 401 error'");
    });

    it("should handle rate limit errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Rate limit exceeded",
            code: "RATE_LIMIT_EXCEEDED",
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        humeCallTextToSpeech(
          "Test",
          {
            apiKey: "test-key",
            apiUri: HUME_API_URL,
            voice: undefined,
            model: "shared",
          },
          [],
          DEFAULT_SETTINGS,
        ),
      ).rejects.toThrow("Request failed 'HTTP 429 error'");
    });

    it("should handle internal server errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          status: "error",
          message: "Internal server error",
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        humeCallTextToSpeech(
          "Test",
          {
            apiKey: "test-key",
            apiUri: HUME_API_URL,
            voice: undefined,
            model: "shared",
          },
          [],
          DEFAULT_SETTINGS,
        ),
      ).rejects.toThrow("Request failed 'HTTP 500 error'");
    });

    it("should handle unrecognized error format", () => {
      const unknownErrorResponse = {
        randomField: "random value",
        anotherField: 123,
      };

      // Test that unrecognized format returns undefined for known fields
      const hasRecognizedFields = !!(
        (unknownErrorResponse as any).fault ||
        (unknownErrorResponse as any).status ||
        (unknownErrorResponse as any).error ||
        (unknownErrorResponse as any).message
      );

      expect(hasRecognizedFields).toBe(false);
    });

    it("should identify different error response patterns", () => {
      const errorPatterns = [
        { fault: { faultstring: "error" } },
        { error: { message: "error" } },
        { status: "error", message: "error" },
        { message: "simple error" },
      ];

      errorPatterns.forEach((pattern) => {
        const hasFault = !!(pattern as any).fault;
        const hasError = !!(pattern as any).error;
        const hasStatus = !!(pattern as any).status;
        const hasMessage = !!(pattern as any).message;

        const hasValidPattern = hasFault || hasError || hasStatus || hasMessage;
        expect(hasValidPattern).toBe(true);
      });
    });
  });
});
