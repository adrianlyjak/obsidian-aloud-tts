import { describe, it, expect } from "vitest";
import cleanMarkdown from "./cleanMarkdown";
describe("cleanMarkdown", () => {
    
  it("should remove horizontal rules", () => {
    const md = "wow\n---\nsuch wow";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("wow\nsuch wow");
  });

  it("should strip links", () => {
    const md = "visit my [site](https://example.com/path?param=1#anchor) here";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("visit my site here");
  });

  it("should strip images", () => {
    const md =
      "We had fun on our vacation\n\n![fun vacation](https://example.com/path.png)\n\nthere were dolphins";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual(
      "We had fun on our vacation\n\nfun vacation\n\nthere were dolphins",
    );
  });

  it("should remove heading tags", () => {
    const md = "# Welcome to Obsidian!\n\n## H2!";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("Welcome to Obsidian!\n\nH2!");
  });

  it("should retain lists", () => {
    const md = "- 1. Go to the store\n- 2. Buy some milk\n";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("- 1. Go to the store\n- 2. Buy some milk\n");
  });

  it("should remove html tags", () => {
    const md = 'be <strong class="red">strong</strong>';
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("be strong");
  });

  it("should remove italics", () => {
    const md = "be _strong_";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("be strong");
  });

  it("should remove bold", () => {
    const md = "be **strong**";
    const cleaned = cleanMarkdown(md);
    expect(cleaned).toEqual("be strong");
  });
});
