import { describe, it, expect } from "vitest";
import { buildTrack } from "./ActiveAudioText";

describe("buildTrack", () => {
  it("reads embedded text in place, anchored to the embed in the note", () => {
    const text = "Intro sentence here. ![[Source]] Outro sentence here.";
    const from = text.indexOf("![[");
    const to = text.indexOf("]]") + 2;
    const track = buildTrack({
      text,
      filename: "note.md",
      start: 100,
      end: 100 + text.length,
      embeds: [
        {
          from,
          to,
          text: "The first embedded sentence. The second embedded sentence.",
        },
      ],
    });
    expect(
      track.chunks.map((chunk) => [chunk.text.trim(), chunk.start, chunk.end]),
    ).toEqual([
      ["Intro sentence here.", 100, 100 + from],
      ["The first embedded sentence.", 100 + from, 100 + to],
      ["The second embedded sentence.", 100 + from, 100 + to],
      ["Outro sentence here.", 100 + to, 100 + text.length],
    ]);
  });
});
