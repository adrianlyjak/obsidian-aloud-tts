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
      chunks[i].audio = { data: new ArrayBuffer(1), format: "mp3" };
      chunks[i].duration = 10;
      chunks[i].offsetDuration = i * 10;
    }

    const active = createActiveAudioText(chunks);
    const sink = createAudioSink(60);

    const result = getPositionAccordingToPlayback(active, sink);

    expect(result).toEqual({ type: "Position", position: 6 });
  });
});
