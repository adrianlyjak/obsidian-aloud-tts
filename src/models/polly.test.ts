import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import {
  pollyTextToSpeech,
  pollyCallTextToSpeech,
  listPollyVoices,
} from "./polly";

global.fetch = vi.fn();

describe("AWS Polly Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("convertToOptions maps settings correctly", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      polly_accessKeyId: "AKIA...",
      polly_secretAccessKey: "secret",
      polly_region: "us-east-1",
      polly_voiceId: "Joanna",
      polly_engine: "neural" as const,
      polly_outputFormat: "mp3" as const,
    };
    const opts = pollyTextToSpeech.convertToOptions(s);
    expect(opts).toMatchObject({
      apiKey: "AKIA...",
      apiUri: "https://polly.us-east-1.amazonaws.com",
      voice: "Joanna",
      model: "neural",
    });
  });

  it("validateConnection returns error without credentials", async () => {
    const s = {
      ...DEFAULT_SETTINGS,
      polly_accessKeyId: "",
      polly_secretAccessKey: "",
    };
    const err = await pollyTextToSpeech.validateConnection(s as any);
    expect(err).toBeTruthy();
  });

  it("listPollyVoices returns mapped voices", async () => {
    const mockJson = {
      Voices: [
        { Id: "Joanna", Name: "Joanna", LanguageName: "US English" },
        { Id: "Matthew", Name: "Matthew", LanguageName: "US English" },
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(mockJson),
    } as any);

    const voices = await listPollyVoices("id", "secret", "us-east-1");
    expect(voices.length).toBe(2);
    expect(voices[0]).toMatchObject({ id: "Joanna", name: "Joanna" });
  });

  it("call returns audio buffer on success", async () => {
    const buf = new ArrayBuffer(8);
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(buf),
    } as any);
    const s = {
      ...DEFAULT_SETTINGS,
      polly_accessKeyId: "AKIA...",
      polly_secretAccessKey: "secret",
      polly_region: "us-east-1",
      polly_voiceId: "Joanna",
      polly_engine: "neural" as const,
      polly_outputFormat: "mp3" as const,
    } as const;
    const opts = pollyTextToSpeech.convertToOptions(s as any);
    const out = await pollyCallTextToSpeech("hello", opts, s as any);
    expect(out).toBe(buf);
  });
});
