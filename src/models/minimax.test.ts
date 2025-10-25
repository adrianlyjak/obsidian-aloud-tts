import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  minimaxTextToSpeech,
  minimaxCallTextToSpeech,
  parseMinimaxResponse,
  MINIMAX_API_URL,
} from "./minimax";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSModelOptions, TTSErrorInfo } from "./tts-model";

// Mock the global fetch
global.fetch = vi.fn();

describe("MiniMax Model", () => {
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
        minimax_apiKey: "test-api-key",
        minimax_groupId: "g-123",
        minimax_ttsModel: "speech-2.6-turbo",
        minimax_ttsVoice: "English_expressive_narrator",
      };

      const options = minimaxTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        model: "speech-2.6-turbo",
        voice: "English_expressive_narrator",
      });
    });
  });

  describe("validateConnection", () => {
    it("should require API key", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        minimax_apiKey: "",
        minimax_groupId: "g-xyz",
      };
      const result = await minimaxTextToSpeech.validateConnection(settings);
      expect(result).toMatch(/Please enter an API key/i);
    });

    it("should require GroupId", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        minimax_apiKey: "sk-abc",
        minimax_groupId: "",
      };
      const result = await minimaxTextToSpeech.validateConnection(settings);
      expect(result).toBe("Please enter your Minimax GroupId in the settings");
    });

    it("returns undefined when both are present", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        minimax_apiKey: "sk-abc",
        minimax_groupId: "g-xyz",
      };
      const result = await minimaxTextToSpeech.validateConnection(settings);
      expect(result).toBeUndefined();
    });
  });

  describe("parseMinimaxResponse", () => {
    it("should parse a successful response", () => {
      const responseText = JSON.stringify({
        data: { audio: "68656c6c6f", status: 2 },
        base_resp: { status_code: 0, status_msg: "" },
      });

      const result = parseMinimaxResponse(responseText, 200);

      expect(result.data.audio).toBe("68656c6c6f");
      expect(result.base_resp.status_code).toBe(0);
    });

    it("should throw on API error with HTTP 200 (e.g., insufficient balance)", () => {
      const responseText = JSON.stringify({
        base_resp: { status_code: 1008, status_msg: "insufficient balance" },
      });

      expect(() => parseMinimaxResponse(responseText, 200)).toThrow(
        TTSErrorInfo,
      );
      expect(() => parseMinimaxResponse(responseText, 200)).toThrow(
        "insufficient balance",
      );
    });

    it("should throw generic message when base_resp has non-zero status but no message", () => {
      const responseText = JSON.stringify({
        base_resp: { status_code: 9999 },
      });

      expect(() => parseMinimaxResponse(responseText, 200)).toThrow(
        "Request failed",
      );
    });

    it("should throw on HTTP error with JSON error body", () => {
      const responseText = JSON.stringify({
        base_resp: { status_code: 401, status_msg: "Unauthorized" },
      });

      expect(() => parseMinimaxResponse(responseText, 401)).toThrow(
        "Unauthorized",
      );
    });

    it("should throw on HTTP error without base_resp error info", () => {
      const responseText = JSON.stringify({});

      expect(() => parseMinimaxResponse(responseText, 500)).toThrow(
        "HTTP 500 error",
      );
    });

    it("should use text body when JSON parsing fails on HTTP error", () => {
      const responseText = "Bad Gateway: upstream server unavailable";

      expect(() => parseMinimaxResponse(responseText, 502)).toThrow(
        "Bad Gateway: upstream server unavailable",
      );
    });

    it("should truncate long text error messages to 200 chars", () => {
      const longText = "x".repeat(300);

      try {
        parseMinimaxResponse(longText, 500);
        expect.fail("should have thrown");
      } catch (e) {
        // The detail is truncated to 200 chars
        expect((e as Error).message).toContain("x".repeat(200));
        expect((e as Error).message).not.toContain("x".repeat(201));
      }
    });

    it("should fall back to HTTP status when text is empty", () => {
      expect(() => parseMinimaxResponse("", 503)).toThrow("HTTP 503");
      expect(() => parseMinimaxResponse("   ", 503)).toThrow("HTTP 503");
    });

    it("should throw non-TTSErrorInfo for invalid JSON on HTTP 200", () => {
      const responseText = "not valid json";

      expect(() => parseMinimaxResponse(responseText, 200)).toThrow(
        "Minimax response was not valid JSON: not valid json",
      );
    });

    it("should throw when response is missing audio data", () => {
      const responseText = JSON.stringify({
        data: {},
        base_resp: { status_code: 0 },
      });

      expect(() => parseMinimaxResponse(responseText, 200)).toThrow(
        "Minimax response missing audio data",
      );
    });
  });

  describe("minimaxCallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "sk-abc",
      model: "speech-2.6-turbo",
      voice: "English_expressive_narrator",
    };

    it("should call t2a_v2 and decode hex audio", async () => {
      // hex for "Hello" -> 68 65 6c 6c 6f
      const audioHex = "68656c6c6f";
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            data: { audio: audioHex, status: 2 },
            base_resp: { status_code: 0, status_msg: "" },
          }),
        ),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const buf = await minimaxCallTextToSpeech(
        "Hello",
        mockOptions,
        { ...DEFAULT_SETTINGS, minimax_groupId: "g-xyz" },
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${MINIMAX_API_URL}/v1/t2a_v2?GroupId=g-xyz`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer sk-abc`,
            "Content-Type": "application/json",
          }),
        }),
      );

      const bytes = new Uint8Array(buf.data);
      expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
      expect(buf.format).toBe("mp3");
    });
  });
});
