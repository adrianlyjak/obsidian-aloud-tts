import { describe, it, expect } from "vitest";
import { buildPdfText, firstVisibleSpan } from "./PdfText";

function at(el: HTMLElement, top: number, bottom: number): HTMLElement {
  el.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
  return el;
}

/** A PDF viewer scrolled so its top edge sits at `top`. */
function viewer(top: number, pages: HTMLElement[]): HTMLElement {
  const container = at(document.createElement("div"), top, top + 500);
  container.append(...pages);
  return container;
}

/** A page with a rendered text layer; each span is [top, bottom]. */
function page(
  pageNumber: number,
  top: number,
  bottom: number,
  spans?: [number, number][],
): HTMLElement {
  const el = at(document.createElement("div"), top, bottom);
  el.className = "page";
  el.dataset.pageNumber = String(pageNumber);
  if (spans) {
    const layer = document.createElement("div");
    layer.className = "textLayer";
    el.append(layer);
    for (const [spanTop, spanBottom] of spans) {
      layer.append(at(document.createElement("span"), spanTop, spanBottom));
      layer.append(document.createElement("br"));
    }
  }
  return el;
}

describe("firstVisibleSpan", () => {
  it("finds the first span whose line is below the top of the viewer", () => {
    const container = viewer(50, [
      page(1, 0, 100, [
        [0, 20],
        [45, 65],
        [70, 90],
      ]),
    ]);

    expect(firstVisibleSpan(container)).toEqual({
      pageNumber: 1,
      spanIndex: 1,
    });
  });

  it("moves to the next page when the visible part of a page has no text", () => {
    const container = viewer(90, [
      page(1, 0, 100, [
        [0, 20],
        [45, 65],
      ]),
      page(2, 100, 200, [[120, 140]]),
    ]);

    expect(firstVisibleSpan(container)).toEqual({
      pageNumber: 2,
      spanIndex: 0,
    });
  });

  it("starts at the top of a page whose text layer hasn't rendered", () => {
    const container = viewer(150, [page(1, 0, 100), page(2, 100, 200)]);

    expect(firstVisibleSpan(container)).toEqual({
      pageNumber: 2,
      spanIndex: 0,
    });
  });

  it("starts at the top of a page whose text layer is still empty", () => {
    const container = viewer(50, [page(1, 0, 100, []), page(2, 100, 200)]);

    expect(firstVisibleSpan(container)).toEqual({
      pageNumber: 1,
      spanIndex: 0,
    });
  });
});

/** A printed line as pdf.js returns it: `str` at (x, y) in a font `size` tall. */
function line(str: string, x: number, y: number, size = 10) {
  return {
    str,
    hasEOL: true,
    transform: [size, 0, 0, size, x, y],
    height: size,
  };
}

describe("buildPdfText paragraphs", () => {
  it("joins the lines of a paragraph with spaces", () => {
    const pdf = buildPdfText([
      [
        line("Ocean thermal energy", 50, 700),
        line("conversion generates", 50, 688),
        line("electricity.", 50, 676),
      ],
    ]);

    expect(pdf.text).toBe(
      "Ocean thermal energy conversion generates electricity.",
    );
  });

  it("keeps the hyphen of a word split at a line end, without a space", () => {
    const pdf = buildPdfText([
      [line("heat ex-", 50, 700), line("changers are needed", 50, 688)],
    ]);

    expect(pdf.text).toBe("heat ex-changers are needed");
  });

  it("starts a paragraph at an indented line after a finished sentence", () => {
    const pdf = buildPdfText([
      [
        line("to sustain an OTEC facility.", 50, 700),
        line("Since OTEC exploits solar energy,", 60, 688),
        line("recurring costs are minimal.", 50, 676),
      ],
    ]);

    expect(pdf.text).toBe(
      "to sustain an OTEC facility.\n\nSince OTEC exploits solar energy, recurring costs are minimal.",
    );
  });

  it("starts a paragraph at each reference with a hanging indent", () => {
    const pdf = buildPdfText([
      [
        line("Marshall JC (1993). Inferring", 50, 700),
        line("the subduction rate.", 62, 689),
        line("McDowell S (1982) North", 50, 678),
        line("Atlantic potential vorticity.", 62, 667),
      ],
    ]);

    expect(pdf.text).toBe(
      "Marshall JC (1993). Inferring the subduction rate.\n\nMcDowell S (1982) North Atlantic potential vorticity.",
    );
  });

  it("doesn't start a paragraph at an indent inside a sentence", () => {
    const pdf = buildPdfText([
      [
        line("The temperature difference,", 50, 700),
        line("T, between the surface", 57, 688),
        line("and the deep ranges widely.", 50, 676),
      ],
    ]);

    expect(pdf.text).toBe(
      "The temperature difference, T, between the surface and the deep ranges widely.",
    );
  });

  it("continues a paragraph into the next column", () => {
    const pdf = buildPdfText([
      [
        line("OTEC systems per kilowatt", 50, 67),
        line("of capacity are", 50, 55),
        line("very high because large", 290, 398),
        line("pipelines are needed.", 290, 386),
      ],
    ]);

    expect(pdf.text).toBe(
      "OTEC systems per kilowatt of capacity are very high because large pipelines are needed.",
    );
  });

  it("starts a paragraph after a larger gap between lines", () => {
    const pdf = buildPdfText([
      [
        line("The first paragraph", 50, 700),
        line("ends here.", 50, 688),
        line("The second paragraph", 50, 670),
        line("starts after a gap.", 50, 658),
      ],
    ]);

    expect(pdf.text).toBe(
      "The first paragraph ends here.\n\nThe second paragraph starts after a gap.",
    );
  });

  it("starts a paragraph where the font size changes", () => {
    const pdf = buildPdfText([
      [
        line("State of the Technology", 50, 700, 12),
        line("OTEC power systems operate", 50, 686),
        line("as heat engines.", 50, 674),
      ],
    ]);

    expect(pdf.text).toBe(
      "State of the Technology\n\nOTEC power systems operate as heat engines.",
    );
  });

  it("continues a paragraph onto the next page", () => {
    const pdf = buildPdfText([
      [
        line("from the warm surface", 50, 112),
        line("to the colder deep", 50, 100),
      ],
      [line("waters below.", 50, 700), line("Since OTEC exploits", 60, 688)],
    ]);

    expect(pdf.text).toBe(
      "from the warm surface to the colder deep waters below.\n\nSince OTEC exploits",
    );
  });
});

describe("buildPdfText", () => {
  // Page items as pdf.js returns them. Items with an empty str are line breaks,
  // which the viewer's text layer draws as <br> rather than as a span.
  const pages = [
    [
      { str: "Hello", hasEOL: true },
      { str: "", hasEOL: true },
      { str: "world.", hasEOL: false },
    ],
    [],
    [{ str: " " }, { str: "Second" }, { str: " " }, { str: "page." }],
  ];

  it("joins pages into the text that gets spoken", () => {
    expect(buildPdfText(pages).text).toBe("Hello world. Second   page.");
  });

  it("finds where a text layer span starts in the spoken text", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(1, 0)).toBe(0);
    // the empty line break item has no span, so span 1 is "world."
    expect(pdf.offsetAt(1, 1)).toBe(6);
    expect(pdf.offsetAt(3, 1)).toBe(13);
  });

  it("skips spans that are only whitespace", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(3, 0)).toBe(13);
    expect(pdf.offsetAt(3, 2)).toBe(22);
  });

  it("falls through pages with no text", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(2, 0)).toBe(13);
    expect(pdf.offsetAt(4, 0)).toBeUndefined();
  });
});
