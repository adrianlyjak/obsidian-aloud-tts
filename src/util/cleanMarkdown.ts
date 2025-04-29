/** Just a bunch of brittle regexes.
 * Loosely based on https://github.com/stiang/remove-markdown
 *
 * Has miscellaneous additions to support weird stuff like Better Bibtex Citekeys
 *
 * */
export default function cleanMarkup(md: string) {
  let output = md || "";

  // First, remove frontmatter (must be done before other transformations)
  output = removeFrontMatter(output);

  // Remove horizontal rules
  output = output.replace(/^\s*(\*{3,}|_{3,}|-{3,})\s*$/gm, "");

  output = output
    // Remove HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove setext-style headers
    .replace(/^[=-]{2,}\s*$/g, "")
    // Remove footnotes?
    .replace(/\[\^.+?\](: .*?$)?/g, "")
    .replace(/\s{0,2}\[.*?\]: .*?$/g, "")
    // Remove images
    .replace(/!\[(.*?)\][[(].*?[\])]/g, "$1")
    // Remove inline links
    .replace(/\[([^\]]*?)\][[(].*?[\])]/g, "$1")
    // Remove blockquotes
    .replace(/^(\n)?\s{0,3}>\s?/gm, "$1")
    // .replace(/(^|\n)\s{0,3}>\s?/g, '\n\n')
    // Remove reference-style links?
    .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "")
    // Remove atx-style headers
    .replace(
      /^(\n)?\s{0,}#{1,6}\s*( (.+))? +#+$|^(\n)?\s{0,}#{1,6}\s*( (.+))?$/gm,
      "$1$3$4$6",
    )
    // Remove * emphasis
    .replace(/([*]+)(\S)(.*?\S)??\1/g, "$2$3")
    // Remove _ emphasis. Unlike *, _ emphasis gets rendered only if
    //   1. Either there is a whitespace character before opening _ and after closing _.
    //   2. Or _ is at the start/end of the string.
    .replace(/(^|\W)([_]+)(\S)(.*?\S)??\2($|\W)/g, "$1$3$4$5")
    // Remove code blocks
    .replace(/^```\w*$\n?/gm, "")
    // Remove inline code
    .replace(/`(.+?)`/g, "$1")
    // Replace strike through
    .replace(/~(.*?)~/g, "$1")
    // remove better bibtex citekeys
    .replace(/\[\s*@[\w,\s]+\s*\]/g, "")
    // remove criticmarkup comments
    .replace(/\{>>.*?<<\}/g, "");

  return output;
}

/**
 * Removes frontmatter blocks from markdown documents.
 * Handles YAML frontmatter (---) at the beginning of a document.
 *
 * @param md - The markdown content to process
 * @returns The markdown content with frontmatter removed
 */
function removeFrontMatter(md: string): string {
  if (!md) {
    return "";
  }

  // Split the content into lines for easier processing
  const lines = md.split("\n");

  // If there aren't enough lines for frontmatter, return unchanged
  if (lines.length < 3) {
    return md;
  }

  // Check if the first line is exactly "---" (YAML frontmatter delimiter)
  // It must be exactly "---" with no other characters
  if (lines[0].trim() !== "---") {
    return md;
  }

  // Look for the closing delimiter (must be exactly "---" on its own line)
  let closingLineIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingLineIndex = i;
      break;
    }
  }

  // If we found a closing delimiter, remove the frontmatter block
  if (closingLineIndex > 0) {
    // Return everything after the closing delimiter
    return "\n" + lines.slice(closingLineIndex + 1).join("\n");
  }

  // No valid frontmatter found
  return md;
}
