import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openAICallTextToSpeech,
  listOpenAIModels,
  OPENAI_API_URL,
} from "./openai";
import { TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Mock the global fetch
global.fetch = vi.fn();

describe("OpenAI Model API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("openAICallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      apiUri: OPENAI_API_URL,
      voice: "alloy",
      instructions: undefined,
      model: "tts-1",
    };

    it("should make correct API call for basic TTS request", async () => {
      const mockAudioBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await openAICallTextToSpeech(
        "Hello world",
        mockOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(`${OPENAI_API_URL}/v1/audio/speech`, {
        headers: {
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          model: "tts-1",
          voice: "alloy",
          input: "Hello world",
          speed: 1.0,
          response_format: "mp3",
        }),
      });

      expect(result).toBe(mockAudioBuffer);
    });

    it("should use custom API URL when provided", async () => {
      const customApiUrl = "https://custom-api.example.com";
      const mockAudioBuffer = new ArrayBuffer(256);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const customOptions: TTSModelOptions = {
        ...mockOptions,
        apiUri: customApiUrl,
      };

      await openAICallTextToSpeech(
        "Custom endpoint test",
        customOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${customApiUrl}/v1/audio/speech`,
        expect.any(Object),
      );
    });

    it("should handle API errors correctly", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Invalid API key",
            type: "invalid_request_error",
            code: "invalid_api_key",
            param: null,
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        openAICallTextToSpeech("Test", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("Request failed 'HTTP 401 error'");

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      await expect(
        openAICallTextToSpeech("Test", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("Network error");
    });
  });

  describe("listOpenAIModels", () => {
    it("should fetch available models successfully", async () => {
      const mockModels = {
        data: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
      };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockModels),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await listOpenAIModels(DEFAULT_SETTINGS);

      expect(fetch).toHaveBeenCalledWith(`${OPENAI_API_URL}/v1/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${DEFAULT_SETTINGS.openai_apiKey}`,
          "Content-Type": "application/json",
        },
      });

      expect(result).toEqual(mockModels.data);
    });

    it("should handle model listing errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Insufficient permissions",
            type: "insufficient_quota",
            code: "insufficient_quota",
            param: null,
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(listOpenAIModels(DEFAULT_SETTINGS)).rejects.toThrow(
        "Request failed 'HTTP 403 error'",
      );
    });
  });
});
