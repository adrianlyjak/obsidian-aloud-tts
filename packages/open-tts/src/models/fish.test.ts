import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

global.fetch = vi.fn();

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
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({
          status: 200,
          json: { total: 0, items: [] },
        }) as Response,
      );

      const result = await validateApiKeyFish("valid-key");

      expect(result).toBeUndefined();
      expect(fetch).toHaveBeenCalledWith(
        `${FISH_API_URL}/model?page_size=50&page_number=1&sort_by=created_at&self=true`,
        {
          headers: {
            Authorization: "Bearer valid-key",
          },
        },
      );
    });

    it("should report invalid API keys", async () => {
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({
          status: 401,
          json: { status: 401, message: "Unauthorized" },
        }) as Response,
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
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({ status: 200, arrayBuffer: audio }) as Response,
      );

      const result = await fishCallTextToSpeech(
        "Hello world",
        options,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(`${FISH_API_URL}/v1/tts`, {
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
      });
      expect(new Uint8Array(result.data)).toEqual(new Uint8Array(audio));
      expect(result.format).toBe("mp3");
    });

    it("should add Fish Audio sentence pause controls", async () => {
      const audio = new Uint8Array([1, 2, 3, 4]).buffer;
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({ status: 200, arrayBuffer: audio }) as Response,
      );

      await fishCallTextToSpeech(
        "Hello world. Next sentence?",
        { ...options, instructions: "short" },
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${FISH_API_URL}/v1/tts`,
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
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({
          status: 422,
          json: { status: 422, message: "Invalid reference_id" },
        }) as Response,
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
      vi.mocked(fetch).mockResolvedValue(
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
        }) as Response,
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
      vi.mocked(fetch).mockResolvedValue(
        fishResponse({
          status: 200,
          json: {
            _id: "voice-id",
            title: "Calm Mystical Narrator",
            visibility: "unlist",
            state: "created",
            type: "tts",
          },
        }) as Response,
      );

      const voice = await getFishVoice("test-key", "voice-id");

      expect(fetch).toHaveBeenCalledWith(`${FISH_API_URL}/model/voice-id`, {
        headers: {
          Authorization: "Bearer test-key",
        },
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
}): Partial<Response> {
  return {
    status,
    json: vi.fn().mockResolvedValue(json),
    arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
  };
}
