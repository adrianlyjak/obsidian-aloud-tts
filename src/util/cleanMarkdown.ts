/** Just a bunch of brittle regexes. Loosely based on https://github.com/stiang/remove-markdown */
export default function cleanMarkdown(md: string) {
  let output = md || "";

  // Remove horizontal rules (stripListHeaders conflict with this rule, which is why it has been moved to the top)
  output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*/gm, "");

  output = output
    // Remove HTML tags
    .replace(/<[^>]*>/g, "");

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
    .replace(/~(.*?)~/g, "$1");

  return output;
}
