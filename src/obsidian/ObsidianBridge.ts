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
import { AudioStore } from "../player/Player";

export interface ObsidianBridge {
  /** editor that is currently playing audio */
  activeEditor: EditorView | undefined;
  /** editor that has cursor */
  focusedEditor: EditorView | undefined;
  playSelection: () => void;
  onTextChanged: (
    position: number,
    type: "add" | "remove",
    text: string,
  ) => void;
  triggerSelection: (file: TFile | null, editor: Editor) => void;
  openSettings: () => void;
  destroy: () => void;
  isMobile: () => boolean;
}

/** observable class for obsidian related implementation to activate audio */
export class ObsidianBridgeImpl implements ObsidianBridge {
  // the editor that was last interacted with for playing audio.
  // I think there's some bugs here. Its not necessarily the playing editor,
  // but sort of is (not always equal to the last focused editor)
  // FIXME!
  active: MarkdownFileInfo | null = null;
  activeEditorView: MarkdownView | null;
  activeFilename: string | null = null;
  audio: AudioStore;
  app: App;
  // the focused editor, or last focused editor if none
  focusedEditorView: MarkdownView | null = null;

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

  constructor(app: App, audio: AudioStore) {
    this.audio = audio;
    this.app = app;
    mobx.makeObservable(this, {
      active: mobx.observable.ref,
      activeEditor: mobx.computed,
      focusedEditorView: mobx.observable.ref,
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

  _setActiveEditor = () => {
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

  triggerSelection(file: TFile | null, editor: Editor) {
    this._setActiveEditor();
    const player: AudioStore = this.audio;
    const from = editor.getCursor("from");
    let to = editor.getCursor("to");
    if (from.ch === to.ch && from.line === to.line) {
      console.log("setting to last line", {
        line: editor.lastLine(),
        ch: editor.getLine(editor.lastLine()).length,
      });
      to = {
        line: editor.lastLine(),
        ch: editor.getLine(editor.lastLine()).length,
      };
    }
    const start = editor.getRange({ line: 0, ch: 0 }, from).length;

    const selection = editor.getRange(from, to);
    console.log({ selection, from, to });
    if (selection) {
      try {
        player.startPlayer({
          text: selection,
          filename:
            [file?.path, file?.name].filter((x) => x).join("/") || "Untitled",
          start,
          end: start + selection.length,
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
