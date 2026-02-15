import { describe, expect, it } from "vitest";
import { AudioTextChunk } from "./AudioTextChunk";

describe("AudioTextChunk.evictAudioData", () => {
  it("clears heavy audio payloads while preserving timeline metadata", () => {
    const chunk = new AudioTextChunk({
      rawText: "Hello world.",
      start: 0,
      end: 12,
    });
    chunk.audio = { data: new ArrayBuffer(4), format: "mp3" };
    chunk.audioBuffer = { duration: 1.25 } as AudioBuffer;
    chunk.duration = 1.25;
    chunk.timelineEpoch = 3;
    chunk.timelineStartSeconds = 42;
    chunk.timelineEndSeconds = 43.25;
    chunk.loading = true;
    chunk.failed = true;
    chunk.failureInfo = new Error("stale") as never;

    chunk.evictAudioData();

    expect(chunk.audio).toBeUndefined();
    expect(chunk.audioBuffer).toBeUndefined();
    expect(chunk.loading).toBe(false);
    expect(chunk.failed).toBeUndefined();
    expect(chunk.failureInfo).toBeUndefined();
    expect(chunk.duration).toBe(1.25);
    expect(chunk.timelineEpoch).toBe(3);
    expect(chunk.timelineStartSeconds).toBe(42);
    expect(chunk.timelineEndSeconds).toBe(43.25);
  });
});

describe("AudioTextChunk.reset", () => {
  it("invalidates timeline metadata for a new epoch", () => {
    const chunk = new AudioTextChunk({
      rawText: "Hello world.",
      start: 0,
      end: 12,
    });
    chunk.duration = 1.25;
    chunk.timelineEpoch = 3;
    chunk.timelineStartSeconds = 42;
    chunk.timelineEndSeconds = 43.25;

    chunk.reset();

    expect(chunk.duration).toBeUndefined();
    expect(chunk.timelineEpoch).toBeUndefined();
    expect(chunk.timelineStartSeconds).toBeUndefined();
    expect(chunk.timelineEndSeconds).toBeUndefined();
  });
});
