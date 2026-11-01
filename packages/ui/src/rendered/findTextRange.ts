/**
 * Rendered parts of a note that aren't its text: embed titles and links, the
 * properties panel, and buttons such as copy-code or fold toggles.
 */
const NOT_NOTE_TEXT =
  ".embed-title, .markdown-embed-link, .metadata-container, .frontmatter-container, button, .copy-code-button, .collapse-indicator";

/** A character of rendered text and where it sits in the DOM */
export interface CharPosition {
  node: Text;
  offset: number;
}

/**
 * The root's note text, keeping only the characters `keep` maps to a non-empty
 * string, plus each kept character's DOM position. Callers drop whitespace
 * because rendered HTML and the spoken text break lines differently (block
 * elements have no space between them). With `within`, only characters inside
 * that range are indexed.
 */
export function indexText(
  root: Node,
  keep: (char: string) => string,
  within?: Range,
): { text: string; positions: CharPosition[] } {
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(NOT_NOTE_TEXT)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let text = "";
  const positions: CharPosition[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node as Text).data;
    for (let offset = 0; offset < value.length; offset++) {
      if (within && within.comparePoint(node, offset) !== 0) {
        continue;
      }
      const kept = keep(value[offset]);
      for (const char of kept) {
        text += char;
        positions.push({ node: node as Text, offset });
      }
    }
  }
  return { text, positions };
}

const withoutWhitespace = (char: string): string =>
  /\s/.test(char) ? "" : char;

/** A range from the first to the last of the given character positions */
export function rangeBetween(first: CharPosition, last: CharPosition): Range {
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

export interface FindTextRangeOptions {
  /** Only match text that starts after this range, e.g. the previous sentence */
  after?: Range | null;
}

/**
 * Finds where `spoken` appears in the root's rendered text, ignoring
 * whitespace. Returns null when it can't be found.
 */
export function findTextRange(
  root: Element,
  spoken: string,
  { after }: FindTextRangeOptions = {},
): Range | null {
  const needle = spoken.replace(/\s+/g, "");
  if (!needle) {
    return null;
  }
  const { text, positions } = indexText(root, withoutWhitespace);
  const startAt = after
    ? positions.findIndex(
        ({ node, offset }) => after.comparePoint(node, offset) > 0,
      )
    : 0;
  if (startAt < 0) {
    return null;
  }
  const index = text.indexOf(needle, startAt);
  if (index < 0) {
    return null;
  }
  return rangeBetween(positions[index], positions[index + needle.length - 1]);
}
