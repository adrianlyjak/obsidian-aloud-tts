interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
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

/** Builds the spoken text from each page's pdf.js text content items. */
export function buildPdfText(pages: unknown[][]): PdfText {
  const pageTexts: string[] = [];
  // per page, where each span's text starts (undefined when it has none)
  const spanOffsets: (number | undefined)[][] = [];
  let length = 0;

  for (const items of pages) {
    const textItems = items.filter(isPdfTextItem);
    const pageText = textItems
      .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
      .join(" ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
    // pages are joined with a blank line
    const pageStart = pageTexts.length > 0 ? length + 2 : 0;

    // Cleanup only removes whitespace, so each span's text appears in order.
    const offsets: (number | undefined)[] = [];
    let cursor = 0;
    for (const item of textItems) {
      if (item.str === "") {
        continue;
      }
      const content = item.str.trim();
      const index = content ? pageText.indexOf(content, cursor) : -1;
      if (index === -1) {
        offsets.push(undefined);
        continue;
      }
      offsets.push(pageStart + index);
      cursor = index + content.length;
    }
    spanOffsets.push(offsets);

    if (pageText) {
      pageTexts.push(pageText);
      length = pageStart + pageText.length;
    }
  }

  return {
    text: pageTexts.join("\n\n"),
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
