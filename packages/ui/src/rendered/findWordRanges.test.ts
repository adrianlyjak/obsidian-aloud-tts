import { describe, it, expect } from "vitest";
import { findTextRange } from "./findTextRange";
import { findWordRanges } from "./findWordRanges";

function sentenceIn(html: string, spoken: string): Range {
  const root = document.createElement("div");
  root.innerHTML = html;
  return findTextRange(root, spoken)!;
}

describe("findWordRanges", () => {
  it("returns one range per spoken word, across inline formatting", () => {
    const sentence = sentenceIn(
      "<p>Read the <a>linked note</a> today.</p>",
      "Read the linked note today.",
    );
    const ranges = findWordRanges(sentence, [
      "Read",
      "the",
      "linked",
      "note",
      "today",
    ]);
    expect(ranges.map((range) => range?.toString())).toEqual([
      "Read",
      "the",
      "linked",
      "note",
      "today",
    ]);
  });

  it("skips a word it can't find and keeps matching the rest", () => {
    const sentence = sentenceIn(
      "<p>Chapter 1 begins.</p>",
      "Chapter 1 begins.",
    );
    const ranges = findWordRanges(sentence, ["Chapter", "one", "begins"]);
    expect(ranges.map((range) => range?.toString() ?? null)).toEqual([
      "Chapter",
      null,
      "begins",
    ]);
  });
});
