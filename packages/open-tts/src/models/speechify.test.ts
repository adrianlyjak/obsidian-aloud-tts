import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listSpeechifyVoices,
  speechifyCallTextToSpeech,
  speechifyTextToSpeech,
  speechifyVoiceOptions,
  splitTextForSpeechify,
  type SpeechifyVoice,
} from "./speechify";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { setHttpFetch } from "../util/http";
import { TTSErrorInfo } from "./tts-model";

global.fetch = vi.fn();

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("Speechify TTS", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("convertToOptions maps settings correctly", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "key",
      speechify_model: "simba-3.2",
      speechify_voice: "george",
    };
    expect(speechifyTextToSpeech.convertToOptions(settings)).toMatchObject({
      apiKey: "key",
      model: "simba-3.2",
      voice: "george",
    });
  });

  it("validateConnection returns an error when the API key is missing", async () => {
    const error = await speechifyTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "",
    });
    expect(error).toContain("Please enter an API key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validateConnection returns undefined for a valid key", async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse(200, { voices: [] }));

    const error = await speechifyTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "valid_key",
    });

    expect(error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/voices?limit=1"),
      expect.objectContaining({
        headers: { Authorization: "Bearer valid_key" },
      }),
    );
  });

  it("validateConnection returns invalid key message on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse(401, {
        error: { code: "unauthorized", message: "Missing credentials" },
      }),
    );

    const error = await speechifyTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "bad_key",
    });

    expect(error).toBe("Invalid API key");
  });

  it("uses the configured http client instead of global fetch", async () => {
    const customFetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse(200, { voices: [] }));
    const previous = setHttpFetch(customFetch as any);
    try {
      const error = await speechifyTextToSpeech.validateConnection({
        ...DEFAULT_SETTINGS,
        speechify_apiKey: "key",
      });

      expect(error).toBeUndefined();
      expect(customFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/voices?limit=1"),
        expect.anything(),
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      setHttpFetch(previous);
    }
  });

  it("call returns decoded audio data and sends the request body", async () => {
    const audio = "UklGRg=="; // Base64 for "RIFF"
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse(200, { audio_data: audio, audio_format: "mp3" }),
    );

    const options = speechifyTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "key",
      speechify_voice: "george",
      speechify_model: "simba-3.2",
    });

    const result = await speechifyCallTextToSpeech(
      "Hello world",
      options,
      DEFAULT_SETTINGS,
    );

    expect(result.format).toBe("mp3");
    expect(result.data.byteLength).toBe(4);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/speech"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer key",
        }),
        body: JSON.stringify({
          input: "Hello world",
          voice_id: "george",
          model: "simba-3.2",
          audio_format: "mp3",
        }),
      }),
    );
  });

  it("call splits long input into multiple requests and concatenates audio", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse(200, { audio_data: "UklGRg==" }),
    );

    const options = speechifyTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "key",
      speechify_voice: "george",
    });

    const text = "word ".repeat(500).trim(); // 2499 characters
    const result = await speechifyCallTextToSpeech(
      text,
      options,
      DEFAULT_SETTINGS,
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.data.byteLength).toBe(8);
  });

  it("call throws TTSErrorInfo with the API error message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse(400, {
        error: {
          code: "model_retired",
          message: "The model simba-english is retired",
        },
      }),
    );

    const options = speechifyTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "key",
    });

    const error = await speechifyCallTextToSpeech(
      "Hello",
      options,
      DEFAULT_SETTINGS,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(TTSErrorInfo);
    expect(error.ttsJsonMessage()).toBe("The model simba-english is retired");
    expect(error.ttsErrorCode()).toBe("model_retired");
  });

  it("call throws when no voice is configured", async () => {
    const options = speechifyTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      speechify_apiKey: "key",
      speechify_voice: "",
    });

    await expect(
      speechifyCallTextToSpeech("Hello", options, DEFAULT_SETTINGS),
    ).rejects.toThrow(TTSErrorInfo);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("listSpeechifyVoices maps voices and follows pagination", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          voices: [
            {
              id: "v1",
              display_name: "Voice One",
              gender: "female",
              locale: "en-US",
              type: "shared",
              models: [{ name: "simba-3.2" }],
            },
          ],
          has_more: true,
          next_cursor: "next-page",
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          voices: [
            {
              id: "v2",
              display_name: "Voice Two",
              gender: "male",
              locale: "en-GB",
              type: "personal",
              models: [],
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const voices = await listSpeechifyVoices("key", "simba-3.2");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("cursor=next-page"),
      expect.anything(),
    );
    expect(voices).toEqual([
      {
        id: "v1",
        name: "Voice One",
        gender: "female",
        locale: "en-US",
        type: "shared",
        models: ["simba-3.2"],
      },
      {
        id: "v2",
        name: "Voice Two",
        gender: "male",
        locale: "en-GB",
        type: "personal",
        models: [],
      },
    ]);
  });

  it("listSpeechifyVoices skips duplicate voice ids", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          voices: [
            {
              id: "dominic",
              display_name: "Dominic",
              gender: "male",
              locale: "en-US",
              type: "shared",
              models: [],
            },
          ],
          has_more: true,
          next_cursor: "next-page",
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          voices: [
            {
              id: "dominic",
              display_name: "Dominic",
              gender: "male",
              locale: "en-US",
              type: "shared",
              models: [],
            },
            {
              id: "dominic_32",
              display_name: "Dominic",
              gender: "male",
              locale: "en-US",
              type: "shared",
              models: [],
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const voices = await listSpeechifyVoices("key");
    expect(voices.map((v) => v.id)).toEqual(["dominic", "dominic_32"]);
  });

  describe("speechifyVoiceOptions", () => {
    function voice(
      id: string,
      name: string,
      locale: string,
      type = "shared",
    ): SpeechifyVoice {
      return { id, name, gender: "male", locale, type, models: [] };
    }

    it("disambiguates voices with duplicate labels", () => {
      const options = speechifyVoiceOptions([
        voice("dominic", "Dominic", "en-US"),
        voice("dominic_32", "Dominic", "en-US"),
        voice("carly", "Carly", "en-US"),
      ]);

      expect(options).toEqual([
        { label: "Dominic (en-US) [dominic]", value: "dominic" },
        { label: "Dominic (en-US) [dominic_32]", value: "dominic_32" },
        { label: "Carly (en-US)", value: "carly" },
      ]);
    });

    it("marks cloned voices", () => {
      const options = speechifyVoiceOptions([
        voice("clone", "My Voice", "en-US", "personal"),
      ]);
      expect(options[0].label).toBe("My Voice (en-US, cloned)");
    });
  });

  describe("splitTextForSpeechify", () => {
    it("returns short text as a single chunk", () => {
      expect(splitTextForSpeechify("Hello world", 20)).toEqual(["Hello world"]);
    });

    it("splits on whitespace without exceeding the limit", () => {
      const text = "word ".repeat(20).trim(); // 99 characters
      const chunks = splitTextForSpeechify(text, 20);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(20);
      }
      expect(chunks.join(" ")).toBe(text);
    });

    it("hard splits text without whitespace", () => {
      const chunks = splitTextForSpeechify("a".repeat(25), 10);
      expect(chunks.map((c) => c.length)).toEqual([10, 10, 5]);
    });
  });
});
