import { describe, it, expect, vi, beforeEach } from "vitest";
import { BatchPlayer } from "./BatchPlayer";
import { AudioSystem } from "./AudioSystem";
import { TTSModel, AudioData, TTSModelOptions } from "../models/tts-model";
import { TTSPluginSettings } from "./TTSPluginSettings";

describe("BatchPlayer Integration", () => {
  let mockSystem: any;
  let mockModel: TTSModel;

  beforeEach(() => {
    mockModel = {
      call: vi.fn().mockResolvedValue({
        data: new ArrayBuffer(10),
        format: "mp3",
      } as AudioData),
      validateConnection: vi.fn().mockResolvedValue(undefined),
      convertToOptions: vi.fn().mockReturnValue({}),
    };

    mockSystem = {
      ttsModel: mockModel,
      settings: {} as TTSPluginSettings,
      audioSink: {
        decodeAudioData: vi.fn().mockResolvedValue({
          duration: 1,
          length: 100,
          numberOfChannels: 1,
          sampleRate: 44100,
          getChannelData: () => new Float32Array(100),
        }),
      },
    };
  });

  it("should generate audio chunks sequentially and report progress", async () => {
    const player = new BatchPlayer(mockSystem as AudioSystem);
    const progressUpdates: any[] = [];

    const text = "First sentence. Second sentence. Third sentence.";
    const options: TTSModelOptions = { model: "chatterbox" };

    const result = await player.generate(text, options, {
      onProgress: (p) => progressUpdates.push(p),
    });

    // expect 3 chunks based on the input text
    expect(mockModel.call).toHaveBeenCalledTimes(3);
    expect(progressUpdates.length).toBe(3);
    expect(progressUpdates[0].current).toBe(1);
    expect(progressUpdates[2].current).toBe(3);
    expect(result.format).toBe("mp3");
  });

  it("should handle errors during generation", async () => {
    const player = new BatchPlayer(mockSystem as AudioSystem);
    mockModel.call = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network failure"));

    const text = "One sentence.";
    const options: TTSModelOptions = { model: "chatterbox" };

    const errorCallback = vi.fn();

    await expect(
      player.generate(text, options, {
        onError: errorCallback,
      }),
    ).rejects.toThrow("Network failure");

    expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
  });

  it("aborts mid-batch when AbortSignal is cancelled", async () => {
    const player = new BatchPlayer(mockSystem as AudioSystem);
    const controller = new AbortController();

    let callCount = 0;
    mockModel.call = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) controller.abort();
      return { data: new ArrayBuffer(10), format: "mp3" } as AudioData;
    });

    const text = "First sentence. Second sentence. Third sentence.";
    const options: TTSModelOptions = { model: "chatterbox" };

    const rejection = player.generate(text, options, {}, controller.signal);
    await expect(rejection).rejects.toThrow();

    // Only the first chunk ran; the loop checked aborted before chunk 2
    expect(mockModel.call).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete with assembled mp3 audio", async () => {
    const player = new BatchPlayer(mockSystem as AudioSystem);
    const onComplete = vi.fn();

    const text = "Just one sentence.";
    const options: TTSModelOptions = { model: "chatterbox" };

    await player.generate(text, options, { onComplete });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ format: "mp3" }),
    );
  });

  it("reports trimmed progress text per chunk", async () => {
    const player = new BatchPlayer(mockSystem as AudioSystem);
    const texts: string[] = [];

    await player.generate(
      "Alpha. Beta.",
      { model: "chatterbox" },
      {
        onProgress: (p) => texts.push(p.text),
      },
    );

    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((t) => expect(t.trim()).toBe(t)); // all pre-trimmed
  });
});
