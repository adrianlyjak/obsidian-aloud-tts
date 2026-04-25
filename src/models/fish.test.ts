import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("Fish Audio Model", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ total: 0, items: [] }), {
          status: 200,
        }),
      );

      const result = await validateApiKeyFish("valid-key");

      expect(result).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        `${FISH_API_URL}/model?page_size=50&page_number=1&sort_by=created_at&self=true`,
        {
          headers: {
            Authorization: "Bearer valid-key",
          },
        },
      );
    });

    it("should report invalid API keys", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: 401, message: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
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
      fetchMock.mockResolvedValue(new Response(audio, { status: 200 }));

      const result = await fishCallTextToSpeech(
        "Hello world",
        options,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetchMock).toHaveBeenCalledWith(`${FISH_API_URL}/v1/tts`, {
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
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ status: 422, message: "Invalid reference_id" }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          },
        ),
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
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
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
          }),
          { status: 200 },
        ),
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
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            _id: "voice-id",
            title: "Calm Mystical Narrator",
            visibility: "unlist",
            state: "created",
            type: "tts",
          }),
          { status: 200 },
        ),
      );

      const voice = await getFishVoice("test-key", "voice-id");

      expect(fetchMock).toHaveBeenCalledWith(`${FISH_API_URL}/model/voice-id`, {
        headers: {
          Authorization: "Bearer test-key",
        },
      });
      expect(voice.title).toBe("Calm Mystical Narrator");
    });
  });
});
