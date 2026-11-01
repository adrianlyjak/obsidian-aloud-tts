import { describe, it, expect } from "vitest";
import { buildTrack } from "./ActiveAudioText";

function spokenChunks(text: string): string[] {
  const track = buildTrack({
    text,
    filename: "note.md",
    start: 0,
    end: text.length,
  });
  return track.chunks.map((chunk) => chunk.text.trim());
}

describe("buildTrack", () => {
  it("keeps a multi-sentence comment together in one chunk", () => {
    const text =
      "First sentence here. %% Comment one. Comment two. %% Last sentence here.";
    expect(spokenChunks(text)).toEqual([
      "First sentence here.",
      "comment: Comment one. Comment two.",
      "Last sentence here.",
    ]);
  });

  it("drops skipped comments while keeping later chunks at their positions", () => {
    const text =
      "First sentence here. %% Hidden one. Hidden two. %% Last sentence here.";
    const track = buildTrack(
      { text, filename: "note.md", start: 0, end: text.length },
      "sentence",
      { comments: "skip" },
    );
    expect(track.chunks.map((chunk) => chunk.text.trim())).toEqual([
      "First sentence here.",
      "Last sentence here.",
    ]);
    expect(track.chunks[1].start).toEqual(text.indexOf(" Last"));
  });
});
