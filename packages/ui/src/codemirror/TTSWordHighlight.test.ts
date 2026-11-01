import { describe, it, expect } from "vitest";
import { AudioSink, AudioStore, AudioTextChunk } from "open-tts";
import { computeWordHighlight } from "./TTSWordHighlight";

function playing(chunk: AudioTextChunk, currentTime: number) {
  const player = {
    activeText: { currentChunk: chunk },
  } as unknown as AudioStore;
  const sink = { currentTime } as unknown as AudioSink;
  return computeWordHighlight(player, sink, 1);
}

describe("computeWordHighlight", () => {
  it("does not highlight words for text read from an embed", () => {
    const chunk = new AudioTextChunk({
      rawText: "The embedded sentence.",
      start: 21,
      end: 32,
      embedded: true,
    });
    chunk.timelineStartSeconds = 0;
    chunk.duration = 2;
    expect(playing(chunk, 0.5)).toBeNull();
  });
});
