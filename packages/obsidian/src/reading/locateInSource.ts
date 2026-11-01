/** Lowercased letters and digits only, so markdown syntax never blocks a match */
const isWordChar = (char: string): boolean => /[\p{L}\p{N}]/u.test(char);

/**
 * Source text that reading view never shows: the target of an aliased
 * [[target|alias]], a markdown link's (url), %% comments %%, and ^block-ids.
 */
const UNRENDERED_SOURCE =
  /\[\[[^\]|]*\||\]\([^)]*\)|%%[\s\S]*?(?:%%|(?![\s\S]))|\^[A-Za-z0-9-]+$/gm;

function hiddenOffsets(source: string): Set<number> {
  const hidden = new Set<number>();
  for (const match of source.matchAll(UNRENDERED_SOURCE)) {
    for (let i = 0; i < match[0].length; i++) {
      hidden.add(match.index! + i);
    }
  }
  return hidden;
}

/**
 * Finds the source span of text selected in rendered markdown, searching from
 * `from` (e.g. the start of the section holding the selection). Only letters
 * and digits are compared, since the rendered text has lost formatting marks
 * and link targets. Returns null when the text isn't found.
 */
export function locateInSource(
  source: string,
  rendered: string,
  from: number,
): { start: number; end: number } | null {
  const needle = [...rendered]
    .filter(isWordChar)
    .map((char) => char.toLowerCase())
    .join("");
  if (!needle) {
    return null;
  }
  const hidden = hiddenOffsets(source);
  let haystack = "";
  const offsets: number[] = [];
  for (let offset = from; offset < source.length; offset++) {
    if (isWordChar(source[offset]) && !hidden.has(offset)) {
      haystack += source[offset].toLowerCase();
      offsets.push(offset);
    }
  }
  const index = haystack.indexOf(needle);
  if (index < 0) {
    return null;
  }
  return {
    start: offsets[index],
    end: offsets[index + needle.length - 1] + 1,
  };
}
