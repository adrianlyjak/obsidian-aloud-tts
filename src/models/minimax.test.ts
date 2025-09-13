import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  minimaxTextToSpeech,
  minimaxCallTextToSpeech,
  MINIMAX_API_URL,
} from "./minimax";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSModelOptions } from "./tts-model";

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
        minimax_ttsModel: "speech-2.5-turbo-preview",
        minimax_ttsVoice: "Grinch",
      };

      const options = minimaxTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        model: "speech-2.5-turbo-preview",
        voice: "Grinch",
        instructions: undefined,
        apiUri: undefined,
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

  describe("minimaxCallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "sk-abc",
      model: "speech-2.5-turbo-preview",
      voice: "Grinch",
    };

    it("should call t2a_v2 and decode hex audio", async () => {
      // hex for "Hello" -> 68 65 6c 6c 6f
      const audioHex = "68656c6c6f";
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: {
            audio: audioHex,
            status: 2,
          },
          base_resp: { status_code: 0, status_msg: "" },
        }),
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

      const bytes = new Uint8Array(buf);
      expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
    });

    it("should surface HTTP errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          base_resp: { status_code: 401, status_msg: "Unauthorized" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        minimaxCallTextToSpeech(
          "Test",
          mockOptions,
          { ...DEFAULT_SETTINGS, minimax_groupId: "g-xyz" },
          {},
        ),
      ).rejects.toThrow("Request failed 'HTTP 401 error'");
    });
  });
});
