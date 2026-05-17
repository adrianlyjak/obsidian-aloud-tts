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
import { TTSPluginSettingsStore } from "open-tts";
import { TTSEditorBridge } from "@open-tts/ui";

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
    options?: { extendShort?: boolean },
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
          // insert at the start of the selection
          editor.replaceRange(
            loadingReplacement,
            editor.getCursor("from"),
            editor.getCursor("from"),
          );
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
    if (f && f.name !== this.activeFilename) {
      // if current window was replaced
      this.active = null;
      this.activeEditorView = null;
      this.activeFilename = null;
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

  playSelection(): void {
    const focused = this.focusedEditorView;
    if (focused?.editor) {
      this.triggerSelection(focused.file, focused.editor);
    } else {
      new Notice("Focus a file or select some text first to play");
    }
  }

  onTextChanged(position: number, type: "add" | "remove", text: string) {
    this.audio.activeText?.onTextChanged(position, type, text);
  }

  triggerSelection(
    file: TFile | null,
    editor: Editor,
    { extendShort }: { extendShort?: boolean } = {},
  ) {
    this._setActiveEditor();
    const player: AudioStore = this.audio;
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
