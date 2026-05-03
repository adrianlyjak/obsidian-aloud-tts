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

  // Convert LaTeX math to speakable text (before other markdown processing
  // since $ can interfere with emphasis regexes)
  output = output.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => cleanMath(m));
  // Inline math: must contain a backslash command or braces (not just plain text/numbers).
  // This avoids matching currency like "$5" or "$10" while catching "$\leq$" or "${x}_{1}$".
  output = output.replace(/\$([^$\n]+?)\$/g, (_, m) =>
    /[\\{}^_]/.test(m) ? cleanMath(m) : "$" + m + "$",
  );

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
    .replace(/!\[(.*?)\][[(].*?[\])]\s*/g, "")
    // Remove inline links
    .replace(/\[([^\]]*?)\][[(].*?[\])]/g, "$1")
    // remove obsidian links
    .replace(/!\[\[.*?\]\]/g, "")
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
    // Remove == highlight markup (e.g., ==highlight==), tolerating inner spaces/newlines
    // Allows leading/trailing whitespace inside the markers while preserving inner content
    .replace(/==\s*([\s\S]*?\S)\s*==/g, "$1")
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

  // Handle tables after all other markdown processing
  // Remove markdown table separator lines (e.g., |---|---|---|)
  output = output.replace(/^\s*\|[\s\-|:]*\|\s*$/gm, "");

  // For table rows, replace the pipe separators with spaces to maintain readability
  // but avoid changing the text length too much to preserve position mapping
  const lines = output.split("\n");
  const processedLines = lines.map((line) => {
    // Only process lines that look like table rows (start and end with | and have at least one more | inside)
    if (/^\s*\|.*\|\s*$/.test(line) && line.split("|").length >= 3) {
      // Replace pipe separators with spaces, preserving the overall structure
      // This maintains better position mapping than completely removing the pipes
      return line.replace(/\|/g, " ");
    }
    return line;
  });
  output = processedLines.join("\n");

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

/** Maps of LaTeX commands to speakable text */
const LATEX_COMMANDS: Record<string, string> = {
  // Relations
  "\\leq": "less than or equal to",
  "\\le": "less than or equal to",
  "\\geq": "greater than or equal to",
  "\\ge": "greater than or equal to",
  "\\neq": "not equal to",
  "\\ne": "not equal to",
  "\\approx": "approximately",
  "\\sim": "approximately",
  "\\equiv": "equivalent to",
  "\\propto": "proportional to",
  "\\ll": "much less than",
  "\\gg": "much greater than",
  // Operators
  "\\times": "times",
  "\\cdot": "times",
  "\\div": "divided by",
  "\\pm": "plus or minus",
  "\\mp": "minus or plus",
  // Structures
  "\\infty": "infinity",
  "\\partial": "partial",
  "\\nabla": "del",
  // Set/logic
  "\\in": "in",
  "\\notin": "not in",
  "\\subset": "subset of",
  "\\subseteq": "subset of",
  "\\supset": "superset of",
  "\\cup": "union",
  "\\cap": "intersection",
  "\\emptyset": "empty set",
  "\\forall": "for all",
  "\\exists": "there exists",
  "\\neg": "not",
  "\\land": "and",
  "\\lor": "or",
  // Arrows
  "\\to": "to",
  "\\rightarrow": "to",
  "\\leftarrow": "from",
  "\\Rightarrow": "implies",
  "\\Leftarrow": "is implied by",
  "\\iff": "if and only if",
  "\\leftrightarrow": "if and only if",
  // Misc
  "\\ldots": "...",
  "\\cdots": "...",
  "\\dots": "...",
  "\\quad": " ",
  "\\qquad": " ",
  "\\,": " ",
  "\\;": " ",
  "\\!": "",
  "\\\\": " ",
};

/**
 * Convert LaTeX math content to speakable text.
 * Handles fractions, roots, subscripts, superscripts, Greek letters,
 * and common commands. Unknown commands are dropped.
 */
function cleanMath(math: string): string {
  let out = math;

  // \frac{a}{b} → "a over b"
  out = out.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "$1 over $2");

  // \sqrt[n]{x} → "nth root of x", \sqrt{x} → "square root of x"
  out = out.replace(
    /\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g,
    "$1th root of $2",
  );
  out = out.replace(/\\sqrt\s*\{([^}]*)\}/g, "square root of $1");

  // \sum, \prod, \int with optional limits
  out = out.replace(/\\sum/g, "sum of");
  out = out.replace(/\\prod/g, "product of");
  out = out.replace(/\\int/g, "integral of");
  out = out.replace(/\\lim/g, "limit of");
  out = out.replace(/\\log/g, "log");
  out = out.replace(/\\ln/g, "ln");
  out = out.replace(/\\sin/g, "sin");
  out = out.replace(/\\cos/g, "cos");
  out = out.replace(/\\tan/g, "tan");

  // Replace known commands from the map (longest match first via iteration)
  for (const [cmd, speech] of Object.entries(LATEX_COMMANDS)) {
    // Escape backslash for regex, match the command not followed by a letter
    const escaped = cmd.replace(/\\/g, "\\\\");
    out = out.replace(new RegExp(escaped + "(?![a-zA-Z])", "g"), speech);
  }

  // Greek letters: strip backslash, TTS handles the word
  // (alpha, beta, gamma, delta, epsilon, theta, lambda, mu, sigma, omega, pi, phi, etc.)
  out = out.replace(
    /\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)\b/g,
    "$1",
  );

  // Drop remaining \commands (unknown ones)
  out = out.replace(/\\[a-zA-Z]+/g, "");
  // Drop remaining backslashes
  out = out.replace(/\\/g, "");

  // Superscript: x^{2} → "x to the 2", x^2 → "x to the 2"
  out = out.replace(/\^\{([^}]*)\}/g, " to the $1");
  out = out.replace(/\^(\S)/g, " to the $1");

  // Subscript: x_{i} → "x sub i", x_i → "x sub i"
  out = out.replace(/_\{([^}]*)\}/g, " sub $1");
  out = out.replace(/_(\S)/g, " sub $1");

  // Remove remaining braces
  out = out.replace(/[{}]/g, "");

  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();

  return out;
}
