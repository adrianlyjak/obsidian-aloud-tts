/**
 * Returns the markdown text an embed link points to, or null when the target
 * can't be read aloud (missing note, image, PDF, and so on).
 */
export type EmbedLookup = (link: string) => Promise<string | null>;

/** An embed in a text, with the text it should be read as */
export interface ResolvedEmbed {
  /** offset of the embed's `!` in the text */
  from: number;
  /** offset just after the embed's closing `]]` */
  to: number;
  /** the embedded markdown */
  text: string;
}

const EMBED_PATTERN = /!\[\[([^\]]+)\]\]/g;
// Where obsidian shows embeds as text: a fenced block (to its closing fence, or
// the end of the text), inline code, or a %% comment %% (unclosed runs to the end)
const UNRENDERED_PATTERN =
  /^(```|~~~)[\s\S]*?(?:^\1|(?![\s\S]))|`[^`\n]+`|%%[\s\S]*?(?:%%|(?![\s\S]))/gm;

/** The text's ![[embeds]], skipping any inside code or comments */
function embedMatches(text: string): RegExpMatchArray[] {
  const unrendered = [...text.matchAll(UNRENDERED_PATTERN)].map((match) => ({
    from: match.index!,
    to: match.index! + match[0].length,
  }));
  return [...text.matchAll(EMBED_PATTERN)].filter(
    (match) =>
      !unrendered.some(
        ({ from, to }) => match.index! >= from && match.index! < to,
      ),
  );
}

/** Finds the ![[embeds]] in a text and resolves each through the lookup */
export async function expandEmbeds(
  text: string,
  lookup: EmbedLookup,
): Promise<ResolvedEmbed[]> {
  const embeds: ResolvedEmbed[] = [];
  for (const match of embedMatches(text)) {
    const embedded = await lookup(match[1]);
    if (embedded !== null) {
      embeds.push({
        from: match.index!,
        to: match.index! + match[0].length,
        text: await inlineEmbeds(embedded, lookup, new Set([match[1]])),
      });
    }
  }
  return embeds;
}

/**
 * Replaces each resolvable embed in a text with its (recursively expanded) text.
 * `ancestors` holds the links being expanded around this text, so an embed that
 * leads back to one of them is dropped instead of recursing forever.
 */
async function inlineEmbeds(
  text: string,
  lookup: EmbedLookup,
  ancestors: Set<string>,
): Promise<string> {
  let output = "";
  let lastIndex = 0;
  for (const match of embedMatches(text)) {
    output += text.slice(lastIndex, match.index);
    lastIndex = match.index! + match[0].length;
    const link = match[1];
    if (ancestors.has(link)) {
      continue;
    }
    const embedded = await lookup(link);
    output +=
      embedded === null
        ? match[0]
        : await inlineEmbeds(embedded, lookup, new Set([...ancestors, link]));
  }
  return output + text.slice(lastIndex);
}
