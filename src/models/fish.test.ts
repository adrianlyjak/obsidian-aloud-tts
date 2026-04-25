import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RequestUrlResponse, requestUrl } from "obsidian";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSModelOptions, TTSErrorInfo } from "./tts-model";
import {
  FISH_API_URL,
  fishCallTextToSpeech,
  fishTextToSpeech,
  getFishVoice,
  listFishVoices,
  validateApiKeyFish,
} from "./fish";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

describe("Fish Audio Model", () => {
  beforeEach(() => {
    vi.mocked(requestUrl).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        fish_apiKey: "test-api-key",
        fish_model: "s2-pro" as const,
        fish_voiceId: "voice-id",
      };

      const options = fishTextToSpeech.convertToOptions(settings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        model: "s2-pro",
        voice: "voice-id",
      });
    });
  });

  describe("validateConnection", () => {
    it("should require an API key", async () => {
      const result = await fishTextToSpeech.validateConnection({
        ...DEFAULT_SETTINGS,
        fish_apiKey: "",
      });

      expect(result).toContain("Please enter an API key");
    });

    it("should validate the API key by listing voices", async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({ status: 200, json: { total: 0, items: [] } }),
      );

      const result = await validateApiKeyFish("valid-key");

      expect(result).toBeUndefined();
      expect(requestUrl).toHaveBeenCalledWith({
        url: `${FISH_API_URL}/model?page_size=50&page_number=1&sort_by=created_at&self=true`,
        headers: {
          Authorization: "Bearer valid-key",
        },
        throw: false,
      });
    });

    it("should report invalid API keys", async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({
          status: 401,
          json: { status: 401, message: "Unauthorized" },
        }),
      );

      const result = await validateApiKeyFish("bad-key");

      expect(result).toBe("Invalid API key");
    });
  });

  describe("fishCallTextToSpeech", () => {
    const options: TTSModelOptions = {
      apiKey: "test-api-key",
      model: "s2-pro",
      voice: "voice-id",
    };

    it("should make a Fish Audio TTS request and return mp3 audio", async () => {
      const audio = new Uint8Array([1, 2, 3, 4]).buffer;
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({ status: 200, arrayBuffer: audio }),
      );

      const result = await fishCallTextToSpeech(
        "Hello world",
        options,
        DEFAULT_SETTINGS,
        {},
      );

      expect(requestUrl).toHaveBeenCalledWith({
        url: `${FISH_API_URL}/v1/tts`,
        method: "POST",
        contentType: "application/json",
        headers: {
          Authorization: "Bearer test-api-key",
          model: "s2-pro",
        },
        body: JSON.stringify({
          text: "Hello world",
          reference_id: "voice-id",
          format: "mp3",
          mp3_bitrate: 128,
          normalize: true,
        }),
        throw: false,
      });
      expect(new Uint8Array(result.data)).toEqual(new Uint8Array(audio));
      expect(result.format).toBe("mp3");
    });

    it("should throw when no voice ID is configured", async () => {
      await expect(
        fishCallTextToSpeech(
          "Hello world",
          { ...options, voice: undefined },
          DEFAULT_SETTINGS,
          {},
        ),
      ).rejects.toThrow("Voice model ID is required for Fish Audio TTS");
    });

    it("should map Fish Audio API errors", async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({
          status: 422,
          json: { status: 422, message: "Invalid reference_id" },
        }),
      );

      try {
        await fishCallTextToSpeech(
          "Hello world",
          options,
          DEFAULT_SETTINGS,
          {},
        );
        expect.fail("Expected Fish Audio request to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(TTSErrorInfo);
        expect(error).toMatchObject({
          httpErrorCode: 422,
        });
      }
    });
  });

  describe("voice helpers", () => {
    it("should list Fish Audio voices", async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({
          status: 200,
          json: {
            total: 1,
            items: [
              {
                _id: "voice-id",
                title: "Calm Mystical Narrator",
                visibility: "unlist",
                state: "created",
                type: "tts",
              },
            ],
          },
        }),
      );

      const voices = await listFishVoices("test-key", true);

      expect(voices).toEqual([
        {
          id: "voice-id",
          title: "Calm Mystical Narrator",
          visibility: "unlist",
          state: "created",
          type: "tts",
        },
      ]);
    });

    it("should get a Fish Audio voice by ID", async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({
          status: 200,
          json: {
            _id: "voice-id",
            title: "Calm Mystical Narrator",
            visibility: "unlist",
            state: "created",
            type: "tts",
          },
        }),
      );

      const voice = await getFishVoice("test-key", "voice-id");

      expect(requestUrl).toHaveBeenCalledWith({
        url: `${FISH_API_URL}/model/voice-id`,
        headers: {
          Authorization: "Bearer test-key",
        },
        throw: false,
      });
      expect(voice.title).toBe("Calm Mystical Narrator");
    });
  });
});

function fishResponse({
  status,
  json = {},
  arrayBuffer = new ArrayBuffer(0),
}: {
  status: number;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
}): RequestUrlResponse {
  return {
    status,
    json,
    arrayBuffer,
    text: typeof json === "string" ? json : JSON.stringify(json),
    headers: {},
  };
}
