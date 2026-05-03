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

  describe("LaTeX math", () => {
    it("should convert the issue example to speakable text", () => {
      const md =
        "Starting with the constraint $6{x}_{1} + 4{x}_{2} \\leq {24}$";
      expect(cleanMarkup(md)).toEqual(
        "Starting with the constraint 6x sub 1 + 4x sub 2 less than or equal to 24",
      );
    });

    it("should handle display math blocks", () => {
      expect(
        cleanMarkup("Consider:\n$$\\frac{a}{b} + \\sqrt{c}$$\nwhich is neat."),
      ).toEqual("Consider:\na over b + square root of c\nwhich is neat.");
    });

    it("should handle display math on its own line", () => {
      expect(cleanMarkup("Result:\n$$E = mc^{2}$$\nis famous.")).toEqual(
        "Result:\nE = mc to the 2\nis famous.",
      );
    });

    it("should handle multiple inline equations on the same line", () => {
      expect(cleanMarkup("$a \\leq b$ and $c \\geq d$")).toEqual(
        "a less than or equal to b and c greater than or equal to d",
      );
      expect(cleanMarkup("$x^{2}$ plus $y^{2}$ equals $z^{2}$")).toEqual(
        "x to the 2 plus y to the 2 equals z to the 2",
      );
    });

    it("should drop unknown LaTeX commands gracefully", () => {
      expect(cleanMarkup("$\\mathrm{kg} \\cdot \\mathrm{m}$")).toEqual(
        "kg times m",
      );
    });

    // Structural commands with brace-delimited arguments
    it.each([
      ["\\frac{a}{b}", "a over b"],
      ["\\frac{x + 1}{y - 2}", "x + 1 over y - 2"],
      ["\\sqrt{16}", "square root of 16"],
      ["\\sqrt[3]{8}", "3th root of 8"],
    ])("structural: $%s → %s", (latex, expected) => {
      expect(cleanMarkup(`$${latex}$`)).toEqual(expected);
    });

    // Command → word mappings
    it.each([
      ["\\leq", "less than or equal to"],
      ["\\geq", "greater than or equal to"],
      ["\\neq", "not equal to"],
      ["\\approx", "approximately"],
      ["\\times", "times"],
      ["\\cdot", "times"],
      ["\\div", "divided by"],
      ["\\pm", "plus or minus"],
      ["\\infty", "infinity"],
      ["\\in", "in"],
      ["\\forall", "for all"],
      ["\\exists", "there exists"],
      ["\\Rightarrow", "implies"],
      ["\\iff", "if and only if"],
      ["\\sum", "sum of"],
      ["\\int", "integral of"],
      ["\\sin", "sin"],
      ["\\cos", "cos"],
    ])("command: $x %s y$ maps %s", (cmd, speech) => {
      expect(cleanMarkup(`$x ${cmd} y$`)).toEqual(`x ${speech} y`);
    });

    // Greek letters: backslash stripped, TTS pronounces the word
    it.each(["alpha", "beta", "gamma", "delta", "pi", "omega", "Sigma"])(
      "greek: $\\%s$ → %s",
      (letter) => {
        expect(cleanMarkup(`$\\${letter}$`)).toEqual(letter);
      },
    );

    // Superscripts and subscripts
    it.each([
      ["x^{2}", "x to the 2"],
      ["x^2", "x to the 2"],
      ["x_{i}", "x sub i"],
      ["x_i", "x sub i"],
      ["x^{2} + y^3 + z_{i}", "x to the 2 + y to the 3 + z sub i"],
    ])("sub/superscript: $%s$ → %s", (latex, expected) => {
      expect(cleanMarkup(`$${latex}$`)).toEqual(expected);
    });

    // Single variables in math mode
    it.each([
      ["$n$", "n"],
      ["$x$", "x"],
      ["$A$", "A"],
    ])("single variable: %s → %s", (md, expected) => {
      expect(cleanMarkup(md)).toEqual(expected);
    });

    it("should handle mixed variables and equations", () => {
      expect(cleanMarkup("If $n$ is large and $m \\leq n$, then")).toEqual(
        "If n is large and m less than or equal to n, then",
      );
    });
  });

  describe("dollar sign preservation", () => {
    // Currency and other non-math uses of $ should not be mangled
    it.each([
      ["single currency", "The price is $5.", "The price is $5."],
      ["two currencies", "costs $5 and $10", "costs $5 and $10"],
      [
        "multiple currencies in prose",
        "She earned $500, saved $200, and spent $100.",
        "She earned $500, saved $200, and spent $100.",
      ],
      [
        "currency range",
        "Costs range from $10 to $50 per unit.",
        "Costs range from $10 to $50 per unit.",
      ],
    ])("%s: preserved", (_label, md, expected) => {
      expect(cleanMarkup(md)).toEqual(expected);
    });
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
