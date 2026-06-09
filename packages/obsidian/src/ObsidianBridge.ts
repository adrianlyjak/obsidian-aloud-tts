import { EditorView } from "@codemirror/view";
import * as mobx from "mobx";
import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Modal,
  Notice,
  Setting,
  TFile,
} from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { IsPlaying } from "./components/ObsidianIsPlaying";
import { AudioStore } from "open-tts";
import { hashString } from "open-tts";
import { TTSPluginSettingsStore, TTSPluginSettings } from "open-tts";
import { TTSEditorBridge } from "@open-tts/ui";
import { BatchPlayer } from "open-tts";
import { permanentCacheKey } from "open-tts";
import { cleanMarkup } from "open-tts";
import { REGISTRY } from "open-tts";
import { TTSModelOptions } from "open-tts";
import { VaultWriter, EmbedMetadata } from "./VaultWriter";

export interface ObsidianBridgeSpecifics {
  activeObsidianEditor: Editor | undefined;
}

export interface ObsidianBridge
  extends TTSEditorBridge,
    ObsidianBridgeSpecifics {
  // Obsidian-specific methods beyond the shared interface
  triggerSelection: (
    file: TFile | null,
    editor: Editor,
    options?: { extendShort?: boolean; forceRestart?: boolean },
  ) => void;
}

/** observable class for obsidian related implementation to activate audio */
export class ObsidianBridgeImpl implements ObsidianBridge {
  // the editor that was last interacted with for playing audio.
  active: MarkdownFileInfo | null = null;
  activeEditorView: MarkdownView | null;
  activeFilename: string | null = null;
  activeObsidianEditor: Editor | undefined = undefined;
  // the focused editor, or last focused editor if none
  focusedEditorView: MarkdownView | null = null;

  isDetachedAudio: boolean = false;
  private _playingIconRoot: Root | null = null;
  get detachedAudio(): boolean {
    return this.isDetachedAudio;
  }

  get focusedEditor(): EditorView | undefined {
    // @ts-expect-error
    const editor = this.focusedEditorView?.editor?.cm as EditorView | undefined;
    return editor || undefined;
  }
  get activeEditor(): EditorView | undefined {
    // @ts-expect-error
    const editor = this.active?.editor?.cm as EditorView | undefined;
    return editor || undefined;
  }

  constructor(
    private app: App,
    private audio: AudioStore,
    private settings: TTSPluginSettingsStore,
  ) {
    mobx.makeObservable(this, {
      active: mobx.observable.ref,
      activeEditor: mobx.computed,
      activeObsidianEditor: mobx.observable.ref,
      focusedEditorView: mobx.observable.ref,
      _setFocusedEditor: mobx.action,
      _setActiveEditor: mobx.action,
      _onLayoutChange: mobx.action,
      _onFileOpen: mobx.action,
    });
    this.app.workspace!.on("active-leaf-change", this._setFocusedEditor);
    this._setFocusedEditor();
    this.app.workspace!.on("layout-change", this._onLayoutChange);
    this.app.workspace!.on("file-open", this._onFileOpen);
  }
  isMobile: () => boolean = () => {
    // docs show this... types do not https://docs.obsidian.md/Plugins/Getting+started/Mobile+development
    // @ts-expect-error
    return this.app.isMobile;
  };

  saveDocumentAudio: () => Promise<void> = async () => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a note first to save its audio.");
      return;
    }
    const text = view.editor.getValue();
    if (!text.trim()) {
      new Notice("No text in the current note to convert.");
      return;
    }
    const baseName =
      view.file?.basename?.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) ||
      "aloud-document";
    const hash = hashString(text, 32).toString(16).slice(0, 8);
    const filename = `${baseName}-${hash}.mp3`;

    const destination = this.settings.settings.audioExportDestination;
    let mode: "vault" | "download" =
      destination === "vault" ? "vault" : "download";
    if (destination === "prompt") {
      const choice = await openExportDestinationModal(this.app);
      if (!choice) return;
      mode = choice;
    }

    new Notice("Generating audio, this may take some time…");
    let bytes: ArrayBuffer;
    try {
      bytes = await this.audio.exportAudio(text);
    } catch (ex) {
      if (ex instanceof DOMException && ex.name === "AbortError") {
        new Notice("Audio export cancelled");
        return;
      }
      console.error("Couldn't generate audio for document!", ex);
      new Notice("Failed to generate audio");
      return;
    }

    try {
      if (mode === "vault") {
        const folder = this.settings.settings.audioFolder;
        const vaultPath = `${folder}/${filename}`;
        await this.app.vault.adapter.mkdir(folder);
        await this.app.vault.adapter.writeBinary(vaultPath, bytes);
        new Notice(`Saved ${vaultPath}`);
      } else {
        triggerBrowserDownload(bytes, filename);
        new Notice(`Downloaded ${filename}`);
      }
    } catch (ex) {
      console.error("Couldn't save audio!", ex);
      new Notice("Failed to save audio file");
    }
  };

  exportAudio: (text: string, replaceSelection: boolean) => Promise<void> =
    async (text, replaceSelection) => {
      if (!text.trim()) {
        new Notice("No text to export");
        return;
      }
      const hash = hashString(text, 32).toString(16);
      const prefix = text
        .replace(/\s/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 20)
        .replace(/-+$/, "");
      const filename = `${this.settings.settings.audioFolder}/${prefix}-${hash}.mp3`;

      const view = this.app.workspace.getActiveViewOfType(MarkdownView);

      const editor = view?.editor;
      const finalReplacement = `![[${filename}]]\n`;
      const loadingReplacement = `<loading file="${filename}" />\n`;
      if (editor) {
        if (replaceSelection) {
          editor.replaceSelection(loadingReplacement);
        } else {
          // Insert the exported audio on a new line below the selected line
          const selectionEnd = editor.getCursor("to");
          const lineBelowSelection = selectionEnd.line + 1;

          if (lineBelowSelection < editor.lineCount()) {
            const insertPosition = { line: lineBelowSelection, ch: 0 };

            editor.replaceRange(
              loadingReplacement,
              insertPosition,
              insertPosition,
            );
          } else {
            const endOfLine = {
              line: selectionEnd.line,
              ch: editor.getLine(selectionEnd.line).length,
            };

            editor.replaceRange(
              `\n${loadingReplacement}`,
              endOfLine,
              endOfLine,
            );
          }
        }
      }

      function removeLoadingState(finalReplacement: string) {
        if (editor) {
          const doc = editor.getValue();
          const escapedLoadingReplacement = loadingReplacement.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
          const match = doc.match(new RegExp(escapedLoadingReplacement));
          if (match) {
            const start = doc.indexOf(match[0]);
            const end = start + match[0].length;
            editor.replaceRange(
              finalReplacement,
              editor.offsetToPos(start),
              editor.offsetToPos(end),
            );
          }
        }
      }
      try {
        new Notice(`Exporting ${filename}, this may take some time`);
        const contents = await this.audio.exportAudio(text);
        await this.app.vault.adapter.mkdir(this.settings.settings.audioFolder);
        await this.app.vault.adapter.writeBinary(filename, contents);
        removeLoadingState(finalReplacement);
        new Notice(`Exported ${filename}`);
      } catch (ex) {
        console.error("Couldn't export audio!", ex);
        new Notice("Failed to export audio");
        removeLoadingState("");
      }
    };

  _setActiveEditor = () => {
    this.isDetachedAudio = false;
    this.active = this.app.workspace?.activeEditor || null;
    this.activeEditorView =
      this.app.workspace.getActiveViewOfType(MarkdownView);
    this.activeObsidianEditor = this.activeEditorView?.editor || undefined;

    this.activeFilename = this.active?.file?.name || null;

    this._attachPlayingIconToEditor(this.activeEditorView);
  };

  _attachPlayingIconToEditor(editor: MarkdownView | null) {
    // Unmount previous React root before creating a new one
    if (this._playingIconRoot) {
      this._playingIconRoot.unmount();
      this._playingIconRoot = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabElement = (editor?.leaf as any | undefined)?.tabHeaderEl;

    if (tabElement) {
      const inner = tabElement.querySelector(".workspace-tab-header-inner");
      if (inner) {
        inner.querySelector(".tts-tab-playing-icon")?.remove();
        const iconSpan = document.createElement("span");
        iconSpan.className = "tts-tab-playing-icon";
        this._playingIconRoot = createRoot(iconSpan);
        this._playingIconRoot.render(
          React.createElement(IsPlaying, {
            audio: this.audio,
            bridge: this,
            editor: this.activeEditor!,
            className: "tts-toolbar-icon",
          }),
        );
        inner.prepend(iconSpan);
      }
    }
  }

  _onFileOpen = () => {
    const f = this.activeEditorView?.file;
    const didSwitchDoc = f != null && f.name !== this.activeFilename;

    if (didSwitchDoc) {
      // Clear active editor refs for the old note
      this.active = null;
      this.activeEditorView = null;
      this.activeFilename = null;

      const behavior = this.settings.settings.docSwitchBehavior;

      if (behavior === "stop") {
        // Halt and clear immediately
        this.audio.closePlayer();
      } else if (behavior === "continue") {
        // Keep playing the old note's audio in the background.
        // Setting detachedAudio=true makes the toolbar float to any focused editor.
        this.isDetachedAudio = true;
      } else if (behavior === "auto-play") {
        // Stop current audio, then auto-start on the newly opened note.
        this.audio.closePlayer();
        // Defer one tick so Obsidian finishes rendering the new editor
        setTimeout(() => {
          const newView = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (newView?.editor && newView.file) {
            this.triggerSelection(newView.file, newView.editor, {
              forceRestart: true,
            });
          }
        }, 50);
      }
    }
  };

  _onLayoutChange = () => {
    // pause the current editor when its window closes
    const didMatch = this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view === this.activeEditorView);
    if (!didMatch) {
      this.audio.activeText?.pause();
    } else {
      // keep the file up to date in case this was triggered by a file rename
      this.activeFilename = this.active?.file?.name || null;
    }
  };

  _setFocusedEditor = () => {
    this.focusedEditorView =
      this.app.workspace.getActiveViewOfType(MarkdownView) ||
      this.focusedEditorView; // is sticky
  };

  destroy: () => void = () => {
    this.app.workspace?.off("active-leaf-change", this._setFocusedEditor);
    this.app.workspace?.off("layout-change", this._onLayoutChange);
    this.app.workspace?.off("file-open", this._onFileOpen);
    if (this._playingIconRoot) {
      this._playingIconRoot.unmount();
      this._playingIconRoot = null;
    }
  };

  playDetached(text: string, filename?: string): void {
    this.isDetachedAudio = true;
    this.audio.startPlayer({
      filename: filename || text.slice(0, 20),
      text,
      start: 0,
      end: text.length,
    });
  }

  playSelection(forceRestart = false): void {
    const focused = this.focusedEditorView;
    if (focused?.editor) {
      this.triggerSelection(focused.file, focused.editor, { forceRestart });
    } else {
      new Notice("Focus a file or select some text first to play");
    }
  }

  onTextChanged(position: number, type: "add" | "remove", text: string) {
    this.audio.activeText?.onTextChanged(position, type, text);
  }

  async triggerSelection(
    file: TFile | null,
    editor: Editor,
    {
      extendShort,
      forceRestart,
    }: { extendShort?: boolean; forceRestart?: boolean } = {},
  ) {
    this._setActiveEditor();
    const player: AudioStore = this.audio;

    // Toggle play/pause when audio is already active for the SAME note.
    // If audio is detached (background-playing a different note) or forceRestart
    // is set, fall through and start fresh on the current note.
    if (!forceRestart && !this.isDetachedAudio && player.activeText) {
      if (player.activeText.isPlaying) {
        player.activeText.pause();
      } else {
        player.activeText.play();
      }
      return;
    }
    // Clear detached state so the new session is anchored to this editor
    this.isDetachedAudio = false;
    const settings = this.settings.settings;
    const from = editor.getCursor("from");
    let to = editor.getCursor("to");
    let isTooShort = false;
    if (extendShort) {
      const text = editor.getRange(from, to);
      isTooShort = !text.trim().match(/\s+/);
    }
    if ((from.ch === to.ch && from.line === to.line) || isTooShort) {
      to = {
        line: editor.lastLine(),
        ch: editor.getLine(editor.lastLine()).length,
      };
    }
    const start = editor.getRange({ line: 0, ch: 0 }, from).length;

    const selection = editor.getRange(from, to);
    if (selection) {
      // Resolve batch config for providers that support vault caching
      const batchConfig = resolveBatchConfig(settings);

      // Apply per-note voice override from frontmatter (tts_voice key)
      let voiceOverride: string | undefined;
      if (file) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.tts_voice) {
          voiceOverride = String(cache.frontmatter.tts_voice);
        }
      }

      if (batchConfig && file) {
        try {
          const cleanedText = cleanMarkup(selection);
          if (!cleanedText.trim()) {
            new Notice("Voice Reader: no readable text found.");
            return;
          }

          const options = resolveModelOptions(settings, voiceOverride);
          const vaultWriter = new VaultWriter(
            this.app,
            batchConfig.audioFolder,
          );
          const hash = await permanentCacheKey(cleanedText, options);
          const embedMeta: EmbedMetadata = {
            provider: settings.modelProvider,
            model: options.model || settings.modelProvider,
            voice: options.voice || "default",
            generatedAt: new Date(),
            noteTitle: file.basename,
          };

          if (await vaultWriter.exists(hash)) {
            await vaultWriter.appendEmbed(
              file,
              vaultWriter.getFilePath(hash),
              embedMeta,
            );
            // Start the streaming player so controls work immediately.
            // Session cache (IndexedDB) serves chunks for free on recent plays;
            // cold session falls back to API but that's acceptable for replay.
            player
              .startPlayer({
                text: cleanedText,
                filename: file.path,
                start: 0,
                end: cleanedText.length,
              })
              .catch(console.error);
            return;
          }

          const charCount = cleanedText.length.toLocaleString();
          const batchPlayer = new BatchPlayer(this.audio.system);
          const controller = new AbortController();

          const progressNotice = new Notice(
            `Voice Reader: generating ${charCount} chars…`,
            0,
          );
          // Add a Stop button directly into the notice's DOM
          const stopBtn = progressNotice.noticeEl.createEl("button", {
            text: "Stop",
            cls: "mod-warning",
          });
          stopBtn.style.cssText =
            "display:block;margin-top:6px;width:100%;cursor:pointer;";
          stopBtn.addEventListener("click", () => {
            controller.abort();
            progressNotice.hide();
            new Notice("Voice Reader: generation stopped.");
          });

          let audio: Awaited<ReturnType<typeof batchPlayer.generate>>;
          try {
            audio = await batchPlayer.generate(
              cleanedText,
              options,
              {
                onProgress: (p) => {
                  progressNotice.setMessage(
                    `Voice Reader: chunk ${p.current} / ${p.total} (${charCount} chars)`,
                  );
                  // Re-attach stop button after setMessage replaces innerHTML
                  if (!progressNotice.noticeEl.contains(stopBtn)) {
                    progressNotice.noticeEl.appendChild(stopBtn);
                  }
                },
                onError: (err) => {
                  progressNotice.hide();
                  new Notice(`Voice Reader error: ${err.message}`);
                },
              },
              controller.signal,
            );
          } catch (ex) {
            if (ex instanceof DOMException && ex.name === "AbortError") {
              return; // user cancelled — notice already hidden
            }
            throw ex;
          }

          const path = await vaultWriter.save(hash, audio.data);
          await vaultWriter.appendEmbed(file, path, embedMeta);
          progressNotice.hide();
          new Notice(`Voice Reader: ready — ${file.basename}`);
          // Start streaming playback immediately after generation
          player
            .startPlayer({
              text: cleanedText,
              filename: file.path,
              start: 0,
              end: cleanedText.length,
            })
            .catch(console.error);
        } catch (ex) {
          if (ex instanceof DOMException && ex.name === "AbortError") return;
          console.error("Batch generation failed", ex);
          const msg = ex instanceof Error ? ex.message : String(ex);
          new Notice(`Voice Reader: generation failed — ${msg}`, 8000);
        }
        return;
      }

      // Fallback to normal streaming player
      try {
        player
          .startPlayer({
            text: selection,
            filename:
              [file?.path, file?.name].filter((x) => x).join("/") || "Untitled",
            start,
            end: start + selection.length,
          })
          .catch((ex) => {
            console.error("Couldn't start player!", ex);
          });
      } catch (ex) {
        console.error("Couldn't start player!", ex);
      }
    } else {
      new Notice("No text selected to speak");
    }
  }

  openSettings(): void {
    // big ugly hack. There's hopefully a better way to do this
    type Commands = {
      commands?: { commands?: Record<string, { callback?: () => void }> };
    };
    (this.app as unknown as Commands)?.commands?.commands?.[
      "app:open-settings"
    ]?.callback?.();
  }
}

export function isObsidianBridgeSpecifics(
  bridge: TTSEditorBridge,
): bridge is TTSEditorBridge & ObsidianBridgeSpecifics {
  return (bridge as any).activeObsidianEditor !== undefined;
}

interface BatchConfig {
  audioFolder: string;
}

/** Returns batch config if the current provider has batch mode enabled, otherwise null. */
function resolveBatchConfig(settings: TTSPluginSettings): BatchConfig | null {
  if (
    settings.modelProvider === "chatterbox" &&
    settings.chatterbox_batchMode
  ) {
    return { audioFolder: settings.audioFolder };
  }
  if (settings.modelProvider === "fish" && settings.fish_batchMode) {
    return { audioFolder: settings.audioFolder };
  }
  if (settings.modelProvider === "minimax" && settings.minimax_batchMode) {
    return { audioFolder: settings.audioFolder };
  }
  return null;
}

/**
 * Resolves TTSModelOptions for the current provider, applying an optional
 * per-note voice override from frontmatter (tts_voice).
 */
function resolveModelOptions(
  settings: TTSPluginSettings,
  voiceOverride?: string,
): TTSModelOptions {
  const options = REGISTRY[settings.modelProvider].convertToOptions(settings);
  if (voiceOverride) {
    return { ...options, voice: voiceOverride };
  }
  return options;
}

function triggerBrowserDownload(bytes: ArrayBuffer, filename: string): void {
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Defer revocation to give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openExportDestinationModal(
  app: App,
): Promise<"vault" | "download" | null> {
  return new Promise((resolve) => {
    const modal = new ExportDestinationModal(app, resolve);
    modal.open();
  });
}

class ExportDestinationModal extends Modal {
  private resolved = false;
  constructor(
    app: App,
    private onChoice: (choice: "vault" | "download" | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Save audio file");
    this.contentEl.createEl("p", {
      text: "Where would you like to save the generated audio?",
    });
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn.setButtonText("Vault folder").onClick(() => this.choose("vault")),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Download")
          .setCta()
          .onClick(() => this.choose("download")),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.choose(null)),
      );
  }

  onClose(): void {
    if (!this.resolved) {
      this.onChoice(null);
    }
    this.contentEl.empty();
  }

  private choose(choice: "vault" | "download" | null): void {
    this.resolved = true;
    this.onChoice(choice);
    this.close();
  }
}
