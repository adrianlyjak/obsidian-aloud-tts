import { describe, it, expect } from "vitest";
import { EmbedLookup, expandEmbeds } from "./expandEmbeds";

function lookupFrom(notes: Record<string, string>): EmbedLookup {
  return async (link) => notes[link] ?? null;
}

describe("expandEmbeds", () => {
  it("resolves an embed to the embedded note's text at the embed's position", async () => {
    const text = "Intro ![[Source]] outro";
    const embeds = await expandEmbeds(text, lookupFrom({ Source: "Hello." }));
    expect(embeds).toEqual([{ from: 6, to: 17, text: "Hello." }]);
  });

  it("expands embeds inside embedded notes in place", async () => {
    const embeds = await expandEmbeds(
      "![[Outer]]",
      lookupFrom({
        Outer: "Outer starts. ![[Inner]] Outer ends.",
        Inner: "Inner.",
      }),
    );
    expect(embeds.map((embed) => embed.text)).toEqual([
      "Outer starts. Inner. Outer ends.",
    ]);
  });

  it("reads each note in an embed cycle only once", async () => {
    const embeds = await expandEmbeds(
      "![[Cycle A]]",
      lookupFrom({
        "Cycle A": "This is A. ![[Cycle B]]",
        "Cycle B": "This is B. ![[Cycle A]]",
      }),
    );
    expect(embeds.map((embed) => embed.text)).toEqual([
      "This is A. This is B. ",
    ]);
  });

  it("leaves embeds inside comments untouched, as obsidian doesn't render them", async () => {
    const text = "Before %% ![[Source]] %% after";
    const embeds = await expandEmbeds(text, lookupFrom({ Source: "Hello." }));
    expect(embeds).toEqual([]);
  });

  it("leaves embeds inside code untouched", async () => {
    const text = "```\n![[Source]]\n```\nand `![[Source]]` inline";
    const embeds = await expandEmbeds(text, lookupFrom({ Source: "Hello." }));
    expect(embeds).toEqual([]);
  });
});
