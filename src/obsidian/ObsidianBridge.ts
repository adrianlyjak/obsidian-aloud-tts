import { EditorView } from "@codemirror/view";
import * as mobx from "mobx";
import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  TFile,
} from "obsidian";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { IsPlaying } from "../components/IsPlaying";
import { AudioStore } from "../player/AudioStore";
import { hashStrings } from "../util/Minhash";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";
import { TTSEditorBridge } from "../codemirror/TTSCodeMirrorCore";

export interface ObsidianBridge extends TTSEditorBridge {
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
  // the focused editor, or last focused editor if none
  focusedEditorView: MarkdownView | null = null;

  isDetachedAudio: boolean = false;
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

  exportAudio: (text: string, replaceSelection: boolean) => Promise<void> =
    async (text, replaceSelection) => {
      if (!text.trim()) {
        new Notice("No text to export");
        return;
      }
      const hash = hashStrings([text])[0].toString(16);
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

    this.activeFilename = this.active?.file?.name || null;

    this._attachPlayingIconToEditor(this.activeEditorView);
  };

  _attachPlayingIconToEditor(editor: MarkdownView | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabElement = (editor?.leaf as any | undefined)?.tabHeaderEl;

    if (tabElement) {
      const inner = tabElement.querySelector(".workspace-tab-header-inner");
      if (inner) {
        inner.querySelector(".tts-tab-playing-icon")?.remove();
        const iconSpan = document.createElement("span");
        iconSpan.className = "tts-tab-playing-icon";
        createRoot(iconSpan).render(
          React.createElement(IsPlaying, {
            audio: this.audio,
            bridge: this,
            editor: this.activeEditor!,
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
    this.app.workspace?.off("layout-change", this._onLayoutChange);
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
