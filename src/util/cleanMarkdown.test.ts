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
      "We had fun on our vacation\n\nthere were dolphins",
    );
  });

  it("should completely remove attachment links", () => {
    const md =
      "Start ![_page_2_Figure_1.jpeg](Basic%20Airway__page_2_Figure_1.jpeg) End";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Start End");
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
    expect(cleaned).toEqual("Here is an image in text");
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

  it("should convert inline math to speakable text", () => {
    const md =
      "Starting with the constraint $6{x}_{1} + 4{x}_{2} \\leq {24}$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual(
      "Starting with the constraint 6x sub 1 + 4x sub 2 less than or equal to 24",
    );
  });

  it("should convert display math to speakable text", () => {
    const md = "Consider:\n$$\\frac{a}{b} + \\sqrt{c}$$\nwhich is neat.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual(
      "Consider:\na over b + square root of c\nwhich is neat.",
    );
  });

  it("should handle Greek letters in math", () => {
    const md = "$\\alpha + \\beta = \\gamma$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("alpha + beta = gamma");
  });

  it("should handle superscripts and subscripts", () => {
    const md = "$x^{2} + y^3 + z_{i}$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("x to the 2 + y to the 3 + z sub i");
  });

  it("should handle \\frac with nested content", () => {
    const md = "$\\frac{x + 1}{y - 2}$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("x + 1 over y - 2");
  });

  it("should handle comparison operators", () => {
    const md = "$a \\geq b$ and $c \\neq d$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual(
      "a greater than or equal to b and c not equal to d",
    );
  });

  it("should handle sum/integral notation", () => {
    const md = "$\\sum_{i=1}^{n} x_i$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("sum of sub i=1 to the n x sub i");
  });

  it("should drop unknown LaTeX commands gracefully", () => {
    const md = "$\\mathrm{kg} \\cdot \\mathrm{m}$";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("kg times m");
  });

  it("should not treat currency dollar signs as math", () => {
    const md = "The price is $5 and the cost is $10.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("The price is $5 and the cost is $10.");
  });

  it("should handle display math blocks on their own lines", () => {
    const md = "Result:\n$$E = mc^{2}$$\nis famous.";
    const cleaned = cleanMarkup(md);
    expect(cleaned).toEqual("Result:\nE = mc to the 2\nis famous.");
  });

  it("should handle tables by removing markup and preserving content", () => {
    const tableText = `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |`;

    const cleaned = cleanMarkup(tableText);

    // Should not contain table separator lines
    expect(cleaned).not.toContain("---");
    // Should contain the actual content (pipes replaced with spaces for better position mapping)
    expect(cleaned).toContain("Cell 1");
    expect(cleaned).toContain("Cell 2");
    expect(cleaned).toContain("Cell 3");
    expect(cleaned).toContain("Column 1");
    expect(cleaned).toContain("Column 2");
    expect(cleaned).toContain("Column 3");
  });
});
