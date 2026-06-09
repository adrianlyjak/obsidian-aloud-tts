import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requestUrl } from "obsidian";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSModelOptions, TTSErrorInfo } from "./tts-model";
import {
  FISH_API_URL,
  addFishSentencePauses,
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
    vi.clearAllMocks();
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
        fish_sentencePause: "long" as const,
      };

      const options = fishTextToSpeech.convertToOptions(settings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        instructions: "long",
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

    it("should report connection failure when the API is unreachable", async () => {
      vi.mocked(requestUrl).mockRejectedValue(new Error("net::ERR_FAILED"));

      const result = await validateApiKeyFish("any-key");

      expect(result).toBe("Cannot connect to Fish Audio API");
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
        headers: {
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
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

    it("should add Fish Audio sentence pause controls", async () => {
      const audio = new Uint8Array([1, 2, 3, 4]).buffer;
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({ status: 200, arrayBuffer: audio }),
      );

      await fishCallTextToSpeech(
        "Hello world. Next sentence?",
        { ...options, instructions: "short" },
        DEFAULT_SETTINGS,
        {},
      );

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({
            text: "Hello world. (break) Next sentence? (break)",
            reference_id: "voice-id",
            format: "mp3",
            mp3_bitrate: 128,
            normalize: false,
          }),
        }),
      );
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

    it("should not call window.fetch for any requests", async () => {
      // Fish Audio's /v1/tts endpoint returns 401 on CORS preflight, blocking
      // fetch() in Obsidian's Electron renderer. requestUrl routes through
      // Obsidian's native layer and bypasses CORS entirely.
      const fetchSpy = vi.spyOn(global, "fetch");
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({
          status: 200,
          arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
        }),
      );

      await fishCallTextToSpeech("Hello world", options, DEFAULT_SETTINGS, {});

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should proceed normally when an AbortSignal is passed", async () => {
      // requestUrl does not support AbortSignal; the signal parameter is
      // accepted for API compatibility but intentionally unused.
      const audio = new Uint8Array([1, 2, 3]).buffer;
      vi.mocked(requestUrl).mockResolvedValue(
        fishResponse({ status: 200, arrayBuffer: audio }),
      );
      const controller = new AbortController();

      const result = await fishCallTextToSpeech(
        "Hello world",
        options,
        DEFAULT_SETTINGS,
        {},
        controller.signal,
      );

      expect(new Uint8Array(result.data)).toEqual(new Uint8Array(audio));
    });

    it("should propagate network errors from requestUrl", async () => {
      vi.mocked(requestUrl).mockRejectedValue(new Error("net::ERR_FAILED"));

      await expect(
        fishCallTextToSpeech("Hello world", options, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("net::ERR_FAILED");
    });
  });

  describe("addFishSentencePauses", () => {
    it("should leave text unchanged when disabled", () => {
      expect(addFishSentencePauses("Hello. Next.", "none")).toBe(
        "Hello. Next.",
      );
    });

    it("should insert short pauses between sentences and at sentence endings", () => {
      expect(addFishSentencePauses("Hello. Next?", "short")).toBe(
        "Hello. (break) Next? (break)",
      );
    });

    it("should insert long pauses while preserving trailing whitespace", () => {
      expect(addFishSentencePauses("Hello. Next.  ", "long")).toBe(
        "Hello. (long-break) Next. (long-break)  ",
      );
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
}) {
  return {
    status,
    headers: {} as Record<string, string>,
    text: "",
    json,
    arrayBuffer,
  };
}
