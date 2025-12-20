import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inworldTextToSpeech, listInworldVoices } from "./inworld";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSErrorInfo } from "./tts-model";

global.fetch = vi.fn();

describe("Inworld TTS", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("convertToOptions maps settings correctly", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "key",
      inworld_modelId: "model",
      inworld_voiceId: "voice",
    } as any;
    expect(inworldTextToSpeech.convertToOptions(s)).toMatchObject({
      apiKey: "key",
      model: "model",
      voice: "voice",
    });
  });

  it("validateConnection returns undefined when connection is valid", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ voices: [] }),
    } as any);

    const error = await inworldTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "valid_key",
    } as any);

    expect(error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/tts/v1/voices"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Basic valid_key" }),
      }),
    );
  });

  it("validateConnection returns error message on 401", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({}),
    } as any);

    const error = await inworldTextToSpeech.validateConnection({
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "invalid_key",
    } as any);

    expect(error).toContain("Invalid API key");
  });

  it("call returns audio buffer on success", async () => {
    const mockAudioContent = "UklGRg=="; // Base64 for "RIFF"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ audioContent: mockAudioContent }),
    } as any);

    const options = inworldTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "key",
      inworld_voiceId: "voice",
      inworld_modelId: "model",
    } as any);

    const buffer = await inworldTextToSpeech.call(
      "Hello world",
      options,
      DEFAULT_SETTINGS,
    );

    expect(buffer.byteLength).toBe(4); // "RIFF" is 4 bytes
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/tts/v1/voice"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Hello world"),
      }),
    );
  });

  it("call throws error on failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ code: 500, message: "Internal Error" }),
    } as any);

    const options = inworldTextToSpeech.convertToOptions({
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "key",
    } as any);

    await expect(
      inworldTextToSpeech.call("Hello", options, DEFAULT_SETTINGS),
    ).rejects.toThrow(TTSErrorInfo);
  });

  it("listInworldVoices returns voices", async () => {
    const mockVoices = [
      {
        voiceId: "v1",
        displayName: "Voice 1",
        tags: ["male"],
      },
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ voices: mockVoices }),
    } as any);

    const voices = await listInworldVoices({
      ...DEFAULT_SETTINGS,
      inworld_apiKey: "key",
    } as any);

    expect(voices).toEqual(mockVoices);
  });
});
