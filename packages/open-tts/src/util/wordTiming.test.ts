import { describe, expect, it } from "vitest";
import {
  estimateWordTimings,
  findWordIndexAt,
  mapTimingsToRawText,
  tokenizeWords,
  wordTimingsFromAlignment,
} from "./wordTiming";

describe("tokenizeWords", () => {
  it("splits words and keeps contractions and hyphenation together", () => {
    expect(tokenizeWords("It's a well-known **fact**, 3.5 times!")).toEqual([
      { word: "It's", from: 0, to: 4 },
      { word: "a", from: 5, to: 6 },
      { word: "well-known", from: 7, to: 17 },
      { word: "fact", from: 20, to: 24 },
      { word: "3.5", from: 28, to: 31 },
      { word: "times", from: 32, to: 37 },
    ]);
  });

  it("handles non-latin scripts", () => {
    expect(tokenizeWords("سلام دنیا").map((t) => t.word)).toEqual([
      "سلام",
      "دنیا",
    ]);
  });
});

describe("wordTimingsFromAlignment", () => {
  it("uses the first and last character times of each word", () => {
    const text = "Go now.";
    const timings = wordTimingsFromAlignment({
      characters: text.split(""),
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    });
    expect(timings).toEqual([
      { word: "Go", start: 0, end: 0.2 },
      { word: "now", start: 0.3, end: 0.6 },
    ]);
  });
});

describe("estimateWordTimings", () => {
  it("spreads words across the duration in order", () => {
    const timings = estimateWordTimings("One two, three.", 3);
    expect(timings.map((t) => t.word)).toEqual(["One", "two", "three"]);
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].start).toBeGreaterThanOrEqual(timings[i - 1].end);
    }
    expect(timings.at(-1)!.end).toBeLessThanOrEqual(3);
  });

  it("returns nothing without a duration", () => {
    expect(estimateWordTimings("Hello", 0)).toEqual([]);
  });
});

describe("mapTimingsToRawText", () => {
  it("maps cleaned words onto raw markdown offsets, skipping link urls", () => {
    const raw = "See [the docs](https://example.com/page) **now**.";
    const mapped = mapTimingsToRawText(raw, [
      { word: "See", start: 0, end: 1 },
      { word: "the", start: 1, end: 2 },
      { word: "docs", start: 2, end: 3 },
      { word: "now", start: 3, end: 4 },
    ]);
    expect(mapped.map((m) => raw.slice(m.from, m.to))).toEqual([
      "See",
      "the",
      "docs",
      "now",
    ]);
  });

  it("skips words that cannot be found", () => {
    const mapped = mapTimingsToRawText("Hello there", [
      { word: "Hello", start: 0, end: 1 },
      { word: "missing", start: 1, end: 2 },
      { word: "there", start: 2, end: 3 },
    ]);
    expect(mapped.map((m) => m.start)).toEqual([0, 2]);
  });
});

describe("findWordIndexAt", () => {
  const words = [{ start: 0.2 }, { start: 0.5 }, { start: 1 }];
  it("finds the last word that has started", () => {
    expect(findWordIndexAt(words, 0.1)).toBe(-1);
    expect(findWordIndexAt(words, 0.2)).toBe(0);
    expect(findWordIndexAt(words, 0.7)).toBe(1);
    expect(findWordIndexAt(words, 5)).toBe(2);
  });
});
