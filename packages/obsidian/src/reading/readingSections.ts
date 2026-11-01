import { MarkdownView } from "obsidian";
import { AudioTextChunk } from "open-tts";
import { locateInSource } from "./locateInSource";

/**
 * Reading View's rendered sections. Obsidian doesn't publish this structure,
 * so only the fields used here are typed, and every one is treated as optional.
 */
interface PreviewSection {
  el?: HTMLElement;
  rendered?: boolean;
  start?: { line: number; offset: number };
  end?: { line: number; offset: number };
}

interface PreviewInternals {
  containerEl: HTMLElement;
  renderer?: { sections?: PreviewSection[]; sizerEl?: HTMLElement };
  applyScroll?: (line: number) => void;
}

type Section = Required<PreviewSection>;

function preview(view: MarkdownView): PreviewInternals {
  return view.previewMode;
}

/** Sections that come from the note's text (not the title or properties UI) */
function noteSections(view: MarkdownView): Section[] {
  return (preview(view).renderer?.sections ?? []).filter(
    (section): section is Section =>
      !!section.el &&
      !!section.start &&
      !!section.end &&
      !section.el.classList.contains("mod-ui") &&
      !section.el.classList.contains("mod-frontmatter"),
  );
}

export function isReadingView(view: MarkdownView | null): boolean {
  return !!view && view.getMode() === "preview";
}

/**
 * The rendered element showing a chunk in Reading View: its section, or the
 * embed inside that section for embedded text. Scrolls an unrendered section
 * into existence and returns null until it has rendered.
 */
export function findReadingRoot(
  view: MarkdownView,
  chunk: AudioTextChunk,
  source: string,
): Element | null {
  if (!isReadingView(view)) {
    return null;
  }
  const overlapping = noteSections(view).filter(
    (section) =>
      section.end.offset > chunk.start && section.start.offset < chunk.end,
  );
  const first = overlapping[0];
  if (!first) {
    return null;
  }
  if (!first.rendered || !first.el.isConnected) {
    preview(view).applyScroll?.(first.start.line);
    return null;
  }
  if (chunk.embedded) {
    const embeds = Array.from(
      first.el.querySelectorAll(".internal-embed"),
    ).filter((embed) => !embed.parentElement?.closest(".internal-embed"));
    const index = (
      source.slice(first.start.offset, chunk.start).match(/!\[\[/g) ?? []
    ).length;
    const embed = embeds[index];
    return embed
      ? (embed.querySelector(".markdown-embed-content") ?? embed)
      : first.el;
  }
  return overlapping.length === 1
    ? first.el
    : (preview(view).renderer?.sizerEl ?? first.el);
}

/** Source offset of the first note section that's at least partly on screen */
export function firstVisibleOffset(view: MarkdownView): number {
  const top = preview(view).containerEl.getBoundingClientRect().top;
  const visible = noteSections(view).find(
    (section) =>
      section.el.isConnected &&
      section.el.getBoundingClientRect().bottom > top + 1,
  );
  return visible?.start.offset ?? 0;
}

/** The source span of the text selected in Reading View, if any */
export function selectedSourceRange(
  view: MarkdownView,
  source: string,
): { start: number; end: number } | null {
  const container = preview(view).containerEl;
  const selection = container.ownerDocument.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !selection.anchorNode ||
    !container.contains(selection.anchorNode)
  ) {
    return null;
  }
  const anchor = selection.anchorNode;
  const section = noteSections(view).find((candidate) =>
    candidate.el.contains(anchor),
  );
  return locateInSource(
    source,
    selection.toString(),
    section?.start.offset ?? 0,
  );
}
