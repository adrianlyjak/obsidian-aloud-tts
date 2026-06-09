import { App, TFile, normalizePath } from "obsidian";
import { PermanentCache, frontmatterLength } from "open-tts";

export interface EmbedMetadata {
  provider: string;
  model: string;
  voice: string;
  generatedAt: Date;
  /** Human-readable label shown in the callout title (e.g. note basename). */
  noteTitle?: string;
}

export class VaultWriter implements PermanentCache {
  private app: App;
  private audioFolder: string;

  constructor(app: App, audioFolder: string) {
    this.app = app;
    this.audioFolder = audioFolder;
  }

  async exists(hash: string): Promise<boolean> {
    const path = this.getFilePath(hash);
    return await this.app.vault.adapter.exists(path);
  }

  async get(hash: string): Promise<ArrayBuffer | undefined> {
    const path = this.getFilePath(hash);
    if (await this.exists(hash)) {
      return await this.app.vault.adapter.readBinary(path);
    }
    return undefined;
  }

  async save(hash: string, data: ArrayBuffer): Promise<string> {
    const path = this.getFilePath(hash);

    const folderPath = normalizePath(this.audioFolder);
    if (!(await this.app.vault.adapter.exists(folderPath))) {
      await this.app.vault.createFolder(folderPath);
    }

    if (await this.exists(hash)) {
      await this.app.vault.adapter.writeBinary(path, data);
    } else {
      await this.app.vault.createBinary(path, data);
    }
    return path;
  }

  getFilePath(hash: string): string {
    return normalizePath(`${this.audioFolder}/${hash}.mp3`);
  }

  /**
   * Inserts a labeled audio callout at the top of the note (after frontmatter).
   * No-op if the same audio path is already embedded.
   * Multiple calls with different paths create distinct labeled blocks.
   */
  async appendEmbed(
    file: TFile,
    audioPath: string,
    metadata?: EmbedMetadata,
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const embedLink = `![[${audioPath}]]`;

    // Already present — skip (works even when embed is inside a callout)
    if (content.includes(embedLink)) return;

    const block = metadata
      ? buildCalloutBlock(embedLink, metadata)
      : embedLink + "\n";

    const fmLen = frontmatterLength(content);
    let newContent: string;

    if (fmLen > 0) {
      const before = content.slice(0, fmLen);
      const after = content.slice(fmLen).replace(/^\s+/, "");
      newContent = `${before}\n${block}\n${after}`;
    } else {
      newContent = `${block}\n${content}`;
    }

    await this.app.vault.modify(file, newContent);
  }
}

function buildCalloutBlock(embedLink: string, meta: EmbedMetadata): string {
  const date = meta.generatedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  // Prefer the note title; fall back to a shortened voice ID
  const label = meta.noteTitle || shortenVoiceId(meta.voice);
  // [!abstract]+ forces the callout open so the audio player is visible immediately
  const title = `🎙 ${label} · ${meta.provider} · ${date}`;
  return `> [!abstract]+ ${title}\n> ${embedLink}\n`;
}

/** Shorten UUID-style voice IDs (with or without dashes) to first 8 hex chars. */
function shortenVoiceId(voice: string): string {
  if (!voice) return "default";
  const hex = voice.replace(/-/g, "");
  return /^[0-9a-f]{16,}$/i.test(hex) ? hex.slice(0, 8) : voice;
}
