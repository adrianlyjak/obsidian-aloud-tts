import { App, parseLinktext, resolveSubpath } from "obsidian";

/**
 * Reads the markdown an ![[embed]] shows: a whole note without its frontmatter,
 * or the heading section or block named by its subpath. Returns null for
 * anything that can't be read aloud, such as missing notes, images, or PDFs.
 */
export async function readEmbed(
  app: App,
  link: string,
  sourcePath: string,
): Promise<string | null> {
  const { path, subpath } = parseLinktext(link.split("|")[0]);
  const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
  if (!file || file.extension !== "md") {
    return null;
  }
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  if (subpath) {
    const resolved = cache ? resolveSubpath(cache, subpath) : null;
    return resolved
      ? content.slice(resolved.start.offset, resolved.end?.offset)
      : null;
  }
  const frontmatterEnd = cache?.frontmatterPosition?.end.offset;
  return frontmatterEnd === undefined ? content : content.slice(frontmatterEnd);
}
