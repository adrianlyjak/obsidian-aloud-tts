import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  elevenLabsCallTextToSpeech,
  listElevenLabsVoices,
  listElevenLabsModels,
  validateApiKeyElevenLabs,
  elevenLabsTextToSpeech,
  ELEVENLABS_API_URL,
} from "./elevenlabs";
import { TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Mock the global fetch
global.fetch = vi.fn();

describe("ElevenLabs Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("elevenLabsTextToSpeech", () => {
    describe("convertToOptions", () => {
      it("should convert settings to options correctly", () => {
        const testSettings = {
          ...DEFAULT_SETTINGS,
          elevenlabs_apiKey: "test-api-key",
          elevenlabs_voice: "test-voice-id",
          elevenlabs_model: "eleven_multilingual_v2",
          elevenlabs_contextMode: true,
        };

        const options = elevenLabsTextToSpeech.convertToOptions(testSettings);

        expect(options).toEqual({
          apiKey: "test-api-key",
          voice: "test-voice-id",
          model: "eleven_multilingual_v2",
          contextMode: true,
        });
      });
    });

    describe("validateConnection", () => {
      it("should require API key", async () => {
        const testSettings = {
          ...DEFAULT_SETTINGS,
          elevenlabs_apiKey: "",
        };

        const result =
          await elevenLabsTextToSpeech.validateConnection(testSettings);

        expect(result).toContain("Please enter an API key");
      });

      it("should validate API key by listing voices", async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            voices: [
              { voice_id: "voice1", name: "Voice 1", category: "premade" },
            ],
          }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as any);

        const testSettings = {
          ...DEFAULT_SETTINGS,
          elevenlabs_apiKey: "valid-api-key",
        };

        const result =
          await elevenLabsTextToSpeech.validateConnection(testSettings);

        expect(result).toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(
          `${ELEVENLABS_API_URL}/v1/voices`,
          expect.objectContaining({
            headers: expect.objectContaining({
              "xi-api-key": "valid-api-key",
            }),
          }),
        );
      });

      it("should return error message for invalid API key", async () => {
        const mockResponse = {
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({
            detail: { message: "Invalid API key" },
          }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as any);

        const testSettings = {
          ...DEFAULT_SETTINGS,
          elevenlabs_apiKey: "invalid-api-key",
        };

        const result =
          await elevenLabsTextToSpeech.validateConnection(testSettings);

        expect(result).toBe("Invalid API key");
      });
    });
  });

  describe("elevenLabsCallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      voice: "test-voice-id",
      model: "eleven_multilingual_v2",
      contextMode: false,
    };

    it("should make correct API call for basic TTS request", async () => {
      const mockAudioBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await elevenLabsCallTextToSpeech(
        "Hello world",
        mockOptions,
        [],
        DEFAULT_SETTINGS,
      );

      expect(fetch).toHaveBeenCalledWith(
        `${ELEVENLABS_API_URL}/v1/text-to-speech/test-voice-id?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": "test-api-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "Hello world",
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        },
      );

      expect(result).toBe(mockAudioBuffer);
    });

    it("should include voice settings when provided", async () => {
      const mockAudioBuffer = new ArrayBuffer(512);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const testSettings = {
        ...DEFAULT_SETTINGS,
        elevenlabs_stability: 0.8,
        elevenlabs_similarity: 0.6,
      };

      await elevenLabsCallTextToSpeech(
        "Hello with settings",
        mockOptions,
        [],
        testSettings,
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            text: "Hello with settings",
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.8,
              similarity_boost: 0.6,
            },
          }),
        }),
      );
    });

    it("should include context when contextMode is enabled", async () => {
      const mockAudioBuffer = new ArrayBuffer(256);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const optionsWithContext: TTSModelOptions = {
        ...mockOptions,
        contextMode: true,
      };

      await elevenLabsCallTextToSpeech(
        "Continue the story",
        optionsWithContext,
        ["Once upon a time", "there was a dragon"],
        DEFAULT_SETTINGS,
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            text: "Continue the story",
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
            previous_text: "Once upon a time there was a dragon",
          }),
        }),
      );
    });

    it("should throw error when voice is not provided", async () => {
      const optionsWithoutVoice: TTSModelOptions = {
        ...mockOptions,
        voice: undefined,
      };

      await expect(
        elevenLabsCallTextToSpeech(
          "Hello world",
          optionsWithoutVoice,
          [],
          DEFAULT_SETTINGS,
        ),
      ).rejects.toThrow("Voice is required for ElevenLabs TTS");
    });

    it("should handle API errors correctly", async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({
          detail: { message: "Invalid voice ID" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(
        elevenLabsCallTextToSpeech(
          "Hello world",
          mockOptions,
          [],
          DEFAULT_SETTINGS,
        ),
      ).rejects.toThrow();
    });
  });

  describe("listElevenLabsVoices", () => {
    it("should fetch and format voices correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          voices: [
            {
              voice_id: "voice1",
              name: "Voice One",
              category: "premade",
            },
            {
              voice_id: "voice2",
              name: "Voice Two",
              category: "cloned",
            },
            {
              voice_id: "voice3",
              name: "Voice Three",
              // category missing
            },
          ],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await listElevenLabsVoices("test-api-key");

      expect(fetch).toHaveBeenCalledWith(`${ELEVENLABS_API_URL}/v1/voices`, {
        headers: {
          "xi-api-key": "test-api-key",
        },
      });

      expect(result).toEqual([
        { id: "voice1", name: "Voice One", category: "premade" },
        { id: "voice2", name: "Voice Two", category: "cloned" },
        { id: "voice3", name: "Voice Three", category: "premade" },
      ]);
    });

    it("should handle API errors", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          detail: "Invalid API key",
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(listElevenLabsVoices("invalid-key")).rejects.toThrow();
    });
  });

  describe("listElevenLabsModels", () => {
    it("should fetch and format models correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([
          {
            model_id: "eleven_multilingual_v2",
            name: "Eleven Multilingual v2",
          },
          {
            model_id: "eleven_flash_v2.5",
            name: "Eleven Flash v2.5",
          },
        ]),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await listElevenLabsModels("test-api-key");

      expect(fetch).toHaveBeenCalledWith(`${ELEVENLABS_API_URL}/v1/models`, {
        headers: {
          "xi-api-key": "test-api-key",
        },
      });

      expect(result).toEqual([
        { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2" },
        { id: "eleven_flash_v2.5", name: "Eleven Flash v2.5" },
      ]);
    });
  });

  describe("validateApiKeyElevenLabs", () => {
    it("should return undefined for valid API key", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          voices: [],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await validateApiKeyElevenLabs("valid-key");

      expect(result).toBeUndefined();
    });

    it("should return error message for invalid API key", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          detail: { message: "Invalid API key" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await validateApiKeyElevenLabs("invalid-key");

      expect(result).toBe("Invalid API key");
    });

    it("should handle general connection errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      const result = await validateApiKeyElevenLabs("test-key");

      expect(result).toBe("Cannot connect to ElevenLabs API");
    });
  });
});
