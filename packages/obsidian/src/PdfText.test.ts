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
    expect(buildPdfText(pages).text).toBe("Hello\n\nworld.\n\nSecond   page.");
  });

  it("finds where a text layer span starts in the spoken text", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(1, 0)).toBe(0);
    // the empty line break item has no span, so span 1 is "world."
    expect(pdf.offsetAt(1, 1)).toBe(7);
    expect(pdf.offsetAt(3, 1)).toBe(15);
  });

  it("skips spans that are only whitespace", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(3, 0)).toBe(15);
    expect(pdf.offsetAt(3, 2)).toBe(24);
  });

  it("falls through pages with no text", () => {
    const pdf = buildPdfText(pages);

    expect(pdf.offsetAt(2, 0)).toBe(15);
    expect(pdf.offsetAt(4, 0)).toBeUndefined();
  });
});
