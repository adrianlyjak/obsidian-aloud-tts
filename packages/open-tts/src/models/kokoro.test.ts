import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import {
  kokoroCallTextToSpeech,
  kokoroTextToSpeech,
  kokoroWordTimings,
} from "./kokoro";

global.fetch = vi.fn();

describe("Kokoro", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("converts settings to options, trimming trailing slashes", () => {
    const options = kokoroTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      kokoro_apiBase: "http://studio.local:8880/",
      kokoro_voice: "af_bella",
    });
    expect(options).toEqual({
      apiUri: "http://studio.local:8880",
      voice: "af_bella",
      model: "kokoro",
    });
  });

  it("requests captioned speech and returns mp3 with word timings", async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue({
        audio: btoa(String.fromCharCode(1, 2, 3)),
        timestamps: [
          { word: "Hello", start_time: 0.1, end_time: 0.4 },
          { word: ",", start_time: 0.4, end_time: 0.5 },
          { word: "world", start_time: 0.5, end_time: 0.9 },
        ],
      }),
    } as any);

    const result = await kokoroCallTextToSpeech(
      "Hello, world",
      { apiUri: "http://host:8880", voice: "af_heart", model: "kokoro" },
      DEFAULT_SETTINGS,
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://host:8880/dev/captioned_speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "kokoro",
          input: "Hello, world",
          voice: "af_heart",
          response_format: "mp3",
          stream: false,
        }),
      }),
    );
    expect(result.format).toBe("mp3");
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.wordTimings).toEqual([
      { word: "Hello", start: 0.1, end: 0.4 },
      { word: "world", start: 0.5, end: 0.9 },
    ]);
  });

  it("reports an unreachable server", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await kokoroTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      kokoro_apiBase: "http://nowhere:8880",
    });
    expect(error).toContain("http://nowhere:8880");
  });

  it("drops punctuation-only timestamps", () => {
    expect(
      kokoroWordTimings([
        { word: ".", start_time: 1, end_time: 1.1 },
        { word: "don't", start_time: 1.1, end_time: 1.4 },
      ]),
    ).toEqual([{ word: "don't", start: 1.1, end: 1.4 }]);
  });
});
