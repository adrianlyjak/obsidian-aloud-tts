import { indexText, rangeBetween } from "./findTextRange";

/** Lowercased letters and digits only, so punctuation and case don't block a match */
const wordChars = (char: string): string =>
  /[\p{L}\p{N}]/u.test(char) ? char.toLowerCase() : "";

/**
 * Finds each spoken word, in order, inside a sentence's rendered range. A word
 * that can't be found (for example a number the provider spoke as words) gets
 * null, and matching carries on from the previous match.
 */
export function findWordRanges(
  sentence: Range,
  words: string[],
): (Range | null)[] {
  // A tree walker never yields its own root, so walk from the parent when the
  // sentence sits inside a single text node.
  const ancestor = sentence.commonAncestorContainer;
  const root =
    ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode! : ancestor;
  const { text, positions } = indexText(root, wordChars, sentence);
  let cursor = 0;
  return words.map((word) => {
    const needle = [...word].map(wordChars).join("");
    const index = needle ? text.indexOf(needle, cursor) : -1;
    if (index < 0) {
      return null;
    }
    cursor = index + needle.length;
    return rangeBetween(positions[index], positions[cursor - 1]);
  });
}
