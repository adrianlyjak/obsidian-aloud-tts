interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  /** pdf.js text matrix: [4] and [5] are where the item starts on the page */
  transform?: number[];
  height?: number;
}

export interface PdfText {
  /** The text spoken for the whole PDF. */
  text: string;
  /**
   * Where a span of the viewer's text layer starts in `text`. A page's spans
   * are its items with a non-empty `str`, counted from 0. Whitespace-only
   * spans and pages without text resolve to the next text after them.
   */
  offsetAt(pageNumber: number, spanIndex: number): number | undefined;
}

/** A printed line of a page. */
interface PdfLine {
  text: string;
  /** Where each of the line's spans starts in `text` (undefined when it has none). */
  spans: (number | undefined)[];
  /** Where the line's text starts on the page */
  x: number;
  y: number;
  /** The font size of the line's first text */
  size: number;
}

/** Builds the spoken text from each page's pdf.js text content items. */
export function buildPdfText(pages: unknown[][]): PdfText {
  let text = "";
  let previous: PdfLine | undefined;
  // per page, where each span's text starts (undefined when it has none)
  const spanOffsets: (number | undefined)[][] = [];

  for (const items of pages) {
    const offsets: (number | undefined)[] = [];
    const lines = pageLines(items.filter(isPdfTextItem));
    const printed = lines.filter((line) => line.text);
    const spacing = lineSpacing(printed);
    for (const line of lines) {
      if (!line.text) {
        offsets.push(...line.spans);
        continue;
      }
      const separator = previous
        ? lineSeparator(previous, printed, printed.indexOf(line), spacing)
        : "";
      const start = text.length + separator.length;
      offsets.push(
        ...line.spans.map((offset) =>
          offset === undefined ? undefined : start + offset,
        ),
      );
      text += separator + line.text;
      previous = line;
    }
    spanOffsets.push(offsets);
  }

  return {
    text,
    offsetAt(pageNumber, spanIndex) {
      for (let page = pageNumber - 1; page < spanOffsets.length; page++) {
        const from = page === pageNumber - 1 ? spanIndex : 0;
        const offset = spanOffsets[page]
          .slice(from)
          .find((value) => value !== undefined);
        if (offset !== undefined) {
          return offset;
        }
      }
      return undefined;
    },
  };
}

/**
 * What goes between the previous printed line and a page's next one: a blank
 * line between paragraphs, and otherwise a space. The previous line can be the
 * last one of the page before.
 */
function lineSeparator(
  previous: PdfLine,
  lines: PdfLine[],
  index: number,
  spacing: number,
): string {
  if (startsParagraph(previous, lines, index, spacing)) {
    return "\n\n";
  }
  // a word split at a line end keeps its hyphen, since a compound like
  // "well-known" can't be told apart from "ex-changers"
  return /\p{L}-$/u.test(previous.text) ? "" : " ";
}

function startsParagraph(
  previous: PdfLine,
  lines: PdfLine[],
  index: number,
  spacing: number,
): boolean {
  const line = lines[index];
  const size = Math.max(line.size, previous.size);
  // a heading, caption, or other text in a different font size
  if (Math.abs(line.size - previous.size) > size * 0.05) {
    return true;
  }
  // a gap well beyond the page's usual line spacing
  if (index > 0 && size > 0 && (previous.y - line.y) / size > spacing * 1.3) {
    return true;
  }
  return /[.!?]["'”’)\]]*$/.test(previous.text) && isIndented(lines, index);
}

/**
 * A page's usual distance between lines, in font sizes. Paragraph gaps are the
 * larger distances, so this takes the lower median.
 */
function lineSpacing(lines: PdfLine[]): number {
  const ratios: number[] = [];
  for (let index = 1; index < lines.length; index++) {
    const gap = lines[index - 1].y - lines[index].y;
    const size = Math.max(lines[index - 1].size, lines[index].size);
    if (gap > 0 && size > 0) {
      ratios.push(gap / size);
    }
  }
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor((ratios.length - 1) / 2)] ?? Infinity;
}

/**
 * Whether a line starts further in or out than the lines next to it, like the
 * indented first line of a paragraph or the first line of a reference with a
 * hanging indent.
 */
function isIndented(lines: PdfLine[], index: number): boolean {
  const line = lines[index];
  const neighbors = [lines[index - 1], lines[index + 1]].filter(
    (neighbor) => neighbor !== undefined,
  );
  return (
    neighbors.length > 0 &&
    neighbors.every((neighbor) => Math.abs(neighbor.x - line.x) > line.size / 2)
  );
}

/** Splits a page's items into lines at each item that ends one. */
function pageLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfTextItem[] = [];
  const endLine = () => {
    const raw = current.map((item) => item.str).join(" ");
    const leading = raw.length - raw.trimStart().length;
    const spans: (number | undefined)[] = [];
    let position = 0;
    for (const item of current) {
      // empty items are line breaks, which the text layer doesn't draw as spans
      if (item.str !== "") {
        const content = item.str.trimStart();
        spans.push(
          content.trim()
            ? position + item.str.length - content.length - leading
            : undefined,
        );
      }
      position += item.str.length + 1;
    }
    const first = current.find((item) => item.str.trim());
    lines.push({
      text: raw.trim(),
      spans,
      x: first?.transform?.[4] ?? 0,
      y: first?.transform?.[5] ?? 0,
      size: first?.height ?? 0,
    });
    current = [];
  };
  for (const item of items) {
    current.push(item);
    if (item.hasEOL) {
      endLine();
    }
  }
  if (current.length > 0) {
    endLine();
  }
  return lines;
}

/**
 * The first text-layer span in a PDF viewer whose line sits below the
 * viewer's top edge. Pages whose text layer hasn't rendered or filled in yet
 * report their first span, so playback starts at the top of that page.
 */
export function firstVisibleSpan(
  container: HTMLElement,
): { pageNumber: number; spanIndex: number } | null {
  const top = container.getBoundingClientRect().top;
  for (const page of Array.from(
    container.querySelectorAll<HTMLElement>(".page[data-page-number]"),
  )) {
    if (page.getBoundingClientRect().bottom <= top) {
      continue;
    }
    const pageNumber = Number(page.dataset.pageNumber);
    // pdf.js draws one span per item with text, and <br> for line breaks
    const spans = Array.from(
      page.querySelectorAll(".textLayer span:not(.markedContent)"),
    );
    if (spans.length === 0) {
      return { pageNumber, spanIndex: 0 };
    }
    const spanIndex = spans.findIndex((span) => {
      const rect = span.getBoundingClientRect();
      return (rect.top + rect.bottom) / 2 >= top;
    });
    if (spanIndex !== -1) {
      return { pageNumber, spanIndex };
    }
  }
  return null;
}

export function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string"
  );
}
