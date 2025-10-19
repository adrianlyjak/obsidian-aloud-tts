import { describe, it, expect } from "vitest";
import cleanMarkup from "./cleanMarkdown";
describe("cleanMarkdown", () => {
  it("should remove horizontal rules", () => {
    const md = "wow\n---\nsuch wow";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("wow\n\nsuch wow");
  });

  it("should strip links", () => {
    const md = "visit my [site](https://example.com/path?param=1#anchor) here";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("visit my site here");
  });

  it("should strip images", () => {
    const md =
      "We had fun on our vacation\n\n![fun vacation](https://example.com/path.png)\n\nthere were dolphins";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual(
      "We had fun on our vacation\n\nfun vacation\n\nthere were dolphins",
    );
  });

  it("should remove heading tags", () => {
    const md = "# Welcome to Obsidian!\n\n## H2!";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Welcome to Obsidian!\n\nH2!");
  });

  it("should retain lists", () => {
    const md = "- 1. Go to the store\n- 2. Buy some milk\n";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("- 1. Go to the store\n- 2. Buy some milk\n");
  });

  it("should remove html tags", () => {
    const md = 'be <strong class="red">strong</strong>';
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("be strong");
  });

  it("should remove italics", () => {
    const md = "be _strong_";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("be strong");
  });

  it("should remove bold", () => {
    const md = "be **strong**";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("be strong");
  });

  it("should remove ==highlight== wrappers (single sentence)", () => {
    const md = "==This is a sentence==";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("This is a sentence");
  });

  it("should remove ==highlight== wrappers (multiple sentences)", () => {
    const md = "==This is a sentence. This is a sentence.==";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("This is a sentence. This is a sentence.");
  });

  it("should remove ==highlight== when content has trailing space before close", () => {
    const md = "==This is a sentence. This is a sentence. ==";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("This is a sentence. This is a sentence.");
  });

  it("should remove ==highlight== when content has leading spaces after open", () => {
    const md = "==   This is a sentence. This is a sentence.==";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("This is a sentence. This is a sentence.");
  });

  it("should remove ==highlight== wrappers spanning newlines", () => {
    const md = "==This is a sentence.\nThis is a sentence.==";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("This is a sentence.\nThis is a sentence.");
  });

  it("should remove ==highlight== wrappers embedded in text", () => {
    const md = "We only ==highlight this phrase== in the sentence.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("We only highlight this phrase in the sentence.");
  });

  it("should remove empty code blocks", () => {
    const md = "```\n\n```";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("\n");
  });

  it("should retain just the code content", () => {
    const md = `alert("hello");\n`;
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual('alert("hello");\n');
  });

  it("should skip Better Bibtex Citekeys", () => {
    const md = "Some text [ @authortitleyear, page ] more text.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Some text  more text.");
  });

  it("should skip Markdown footnotes", () => {
    const md = "Some text[^1] more text.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Some text more text.");
  });

  it("should skip CriticMarkup text for suggestions and comments", () => {
    const md = "Some text {>> notes to self <<} more text.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Some text  more text.");
  });

  it("should remove YAML frontmatter", () => {
    const md = `---
title: My Document
date: 2024-03-14
tags:
  - test
  - example
---

# Actual Content
This is the real content.`;
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("\nActual Content\nThis is the real content.");
  });

  it("should remove obsidian image links", () => {
    const md = "Here is an image ![image name](path/to/image.png) in text";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Here is an image image name in text");
  });

  it("should remove obsidian wiki links", () => {
    const md = "Here is a link ![[Page Name]] in text";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Here is a link  in text");
  });

  it("should not remove text that just happens to have dashes", () => {
    const md = `---not frontmatter---
Just some text with dashes`;
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual(
      "---not frontmatter---\nJust some text with dashes",
    );
  });
});
