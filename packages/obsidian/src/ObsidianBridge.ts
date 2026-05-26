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
  loadPdfJs,
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
  canPlayDetachedAudio: boolean;
  // Obsidian-specific methods beyond the shared interface
  triggerSelection: (
    file: TFile | null,
    editor: Editor,
    options?: { extendShort?: boolean },
  ) => void;
  playDetached: (text: string, filename?: string) => void;
  playSelection: () => void;
  playClipboard: () => Promise<void>;
}

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

interface PdfTextContent {
  items: unknown[];
}

interface PdfPage {
  getTextContent: () => Promise<PdfTextContent>;
}

interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => Promise<void> | void;
}

interface PdfDocumentLoadingTask {
  promise: Promise<PdfDocument>;
}

interface PdfJs {
  getDocument: (source: { data: Uint8Array }) => PdfDocumentLoadingTask;
}

type PdfFileView = {
  file: TFile | null;
  getViewType: () => string;
  containerEl?: HTMLElement;
  contentEl?: HTMLElement;
};

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
  activeViewType: string | null = null;
  private _playingIconRoot: Root | null = null;
  get detachedAudio(): boolean {
    return this.isDetachedAudio;
  }
  get canPlayDetachedAudio(): boolean {
    return this.activeViewType === "pdf";
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
      activeViewType: mobx.observable,
      canPlayDetachedAudio: mobx.computed,
      detachedAudio: mobx.computed,
      focusedEditorView: mobx.observable.ref,
      isDetachedAudio: mobx.observable,
      _setFocusedEditor: mobx.action,
      _setActiveEditor: mobx.action,
      _syncActiveViewType: mobx.action,
      _onLayoutChange: mobx.action,
      _onFileOpen: mobx.action,
      playDetached: mobx.action,
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
    this._syncActiveViewType();
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
    this._syncActiveViewType();
    const f = this.activeEditorView?.file;
    if (f && f.name !== this.activeFilename) {
      // if current window was replaced
      this.active = null;
      this.activeEditorView = null;
      this.activeFilename = null;
    }
  };

  _onLayoutChange = () => {
    this._syncActiveViewType();
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
    this._syncActiveViewType();
    this.focusedEditorView =
      this.app.workspace.getActiveViewOfType(MarkdownView) ||
      this.focusedEditorView; // is sticky
  };

  _syncActiveViewType = () => {
    this.activeViewType =
      this.app.workspace.activeLeaf?.view.getViewType() || null;
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

  async playClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        new Notice("No text found in clipboard");
        return;
      }
      this.playDetached(text);
    } catch (ex) {
      console.error("Failed to play clipboard audio", ex);
      new Notice("Failed to get data from clipboard");
    }
  }

  playDetached(text: string, filename?: string): void {
    if (!text.trim()) {
      new Notice("No text selected to speak");
      return;
    }
    this.isDetachedAudio = true;
    void this.audio
      .startPlayer({
        filename: filename || text.slice(0, 20),
        text,
        start: 0,
        end: text.length,
      })
      .catch((ex) => {
        console.error("Couldn't start player!", ex);
        mobx.runInAction(() => {
          this.isDetachedAudio = false;
        });
        new Notice("Failed to start audio");
      });
  }

  playSelection(): void {
    const pdfView = this.getActivePdfView();
    if (pdfView) {
      void this.playPdfSelectionOrDocument(pdfView);
      return;
    }

    const focused = this.focusedEditorView;
    if (focused?.editor) {
      this.triggerSelection(focused.file, focused.editor);
    } else {
      new Notice("Focus a file or select some text first to play");
    }
  }

  private getActivePdfView(): PdfFileView | null {
    const view = this.app.workspace.activeLeaf?.view;
    return isPdfFileView(view) ? view : null;
  }

  private async playPdfSelectionOrDocument(view: PdfFileView): Promise<void> {
    const file = view.file;
    if (!file) {
      new Notice("No PDF file to play");
      return;
    }
    const selection = this.getPdfSelection(view);
    if (selection) {
      this.playDetached(selection, file.path);
      return;
    }

    try {
      new Notice("Loading PDF text");
      const text = await this.readPdfText(file);
      this.playDetached(text, file.path);
    } catch (ex) {
      console.error("Failed to load PDF text", ex);
      new Notice("Failed to load PDF text");
    }
  }

  private getPdfSelection(view: PdfFileView): string {
    const selection = (
      typeof activeWindow !== "undefined" ? activeWindow : window
    ).getSelection();
    const text = selection?.toString().trim();
    if (!selection || !text || selection.rangeCount === 0) {
      return "";
    }

    const root = view.contentEl || view.containerEl;
    if (!root) {
      return "";
    }

    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index);
      if (
        nodeIsInside(root, range.commonAncestorContainer) ||
        nodeIsInside(root, selection.anchorNode) ||
        nodeIsInside(root, selection.focusNode)
      ) {
        return text;
      }
    }
    return "";
  }

  private async readPdfText(file: TFile): Promise<string> {
    const pdfjs = (await loadPdfJs()) as PdfJs;
    const data = new Uint8Array(await this.app.vault.readBinary(file));
    const document = await pdfjs.getDocument({ data }).promise;
    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .filter(isPdfTextItem)
          .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
          .join(" ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .trim();
        if (text) {
          pages.push(text);
        }
      }
      return pages.join("\n\n");
    } finally {
      await document.destroy?.();
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

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string"
  );
}

function isPdfFileView(view: unknown): view is PdfFileView {
  return (
    typeof view === "object" &&
    view !== null &&
    "file" in view &&
    "getViewType" in view &&
    typeof view.getViewType === "function" &&
    view.getViewType() === "pdf"
  );
}

function nodeIsInside(root: HTMLElement, node: Node | null): boolean {
  return !!node && (node === root || root.contains(node));
}
