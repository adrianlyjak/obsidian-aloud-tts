import { describe, expect, it } from "vitest";
import { AudioTextChunk } from "./AudioTextChunk";
import { getPositionAccordingToPlayback } from "./ChunkPlayer";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSink } from "./AudioSink";

function createChunk(index: number): AudioTextChunk {
  const chunk = new AudioTextChunk({
    rawText: `Chunk ${index}.`,
    start: index * 10,
    end: index * 10 + 10,
  });
  return chunk;
}

function markChunkLoaded(
  chunk: AudioTextChunk,
  {
    timelineStartSeconds,
    duration,
    timelineEpoch = 1,
  }: { timelineStartSeconds: number; duration: number; timelineEpoch?: number },
): void {
  chunk.audio = { data: new ArrayBuffer(1), format: "mp3" };
  chunk.duration = duration;
  chunk.timelineStartSeconds = timelineStartSeconds;
  chunk.timelineEndSeconds = timelineStartSeconds + duration;
  chunk.timelineEpoch = timelineEpoch;
}

function createAudioSink(currentTime: number): AudioSink {
  return {
    isPlaying: true,
    currentTime,
    trackStatus: "playing",
    audio: {
      currentTime,
    } as HTMLAudioElement,
    play: () => undefined,
    pause: () => undefined,
    restart: () => undefined,
    setRate: () => undefined,
    clearMedia: async () => undefined,
    getAudioBuffer: async () => ({ duration: 0 }) as AudioBuffer,
    switchMedia: async () => undefined,
    appendMedia: async () => undefined,
    mediaComplete: async () => undefined,
    destroy: () => undefined,
  };
}

function createActiveAudioText(chunks: AudioTextChunk[]): ActiveAudioText {
  return {
    audio: {
      id: "test",
      filename: "test.md",
      friendlyName: "test",
      created: Date.now(),
      chunks,
    },
    queue: undefined,
    isPlaying: true,
    isLoading: false,
    error: undefined,
    position: 8,
    lastPositionChange: Date.now(),
    currentChunk: chunks[8],
    play: () => undefined,
    pause: () => undefined,
    destroy: () => undefined,
    goToNext: () => undefined,
    goToPrevious: () => undefined,
    setPosition: () => undefined,
    onTextChanged: () => undefined,
    onMultiTextChanged: () => undefined,
  };
}

describe("getPositionAccordingToPlayback", () => {
  it("maps currentTime to the first loaded chunk when earlier chunks were evicted", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => createChunk(i));
    for (let i = 6; i < 12; i++) {
      markChunkLoaded(chunks[i], {
        duration: 10,
        timelineStartSeconds: i * 10,
      });
    }

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(60);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "Position", position: 6 });
  });

  it("uses preserved offsets for post-eviction seek mapping", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => createChunk(i));
    // Simulate an eviction window where early chunks no longer have audio data,
    // but later loaded chunks retain absolute offsets.
    markChunkLoaded(chunks[6], { duration: 10, timelineStartSeconds: 60 });
    markChunkLoaded(chunks[7], { duration: 10, timelineStartSeconds: 70 });
    markChunkLoaded(chunks[8], { duration: 10, timelineStartSeconds: 80 });

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(75);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "Position", position: 7 });
  });

  it("returns AfterLoaded when playback time exceeds loaded offsets", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => createChunk(i));
    markChunkLoaded(chunks[6], { duration: 10, timelineStartSeconds: 60 });
    markChunkLoaded(chunks[7], { duration: 10, timelineStartSeconds: 70 });

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(95);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "AfterLoaded", position: 8 });
  });

  it("maps exact chunk-end boundary to the ending chunk", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => createChunk(i));
    markChunkLoaded(chunks[6], { duration: 10, timelineStartSeconds: 60 });
    markChunkLoaded(chunks[7], { duration: 10, timelineStartSeconds: 70 });

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(70);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "Position", position: 6 });
  });

  it("returns BeforeLoaded when playback is before the first loaded timeline start", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => createChunk(i));
    markChunkLoaded(chunks[6], { duration: 10, timelineStartSeconds: 60 });
    markChunkLoaded(chunks[7], { duration: 10, timelineStartSeconds: 70 });

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(59.99);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "BeforeLoaded", position: 5 });
  });
});
