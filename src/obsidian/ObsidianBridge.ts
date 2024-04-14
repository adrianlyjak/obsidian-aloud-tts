import * as mobx from "mobx";
import { EditorView } from "@codemirror/view";
import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  TFile,
} from "obsidian";
import { AudioStore } from "src/player/Player";

export interface ObsidianBridge {
  /** editor that is currently playing audio */
  activeEditor: EditorView | undefined;
  playSelection: () => void;
  playSelectionIfAny: () => void;
  onTextChanged: (
    position: number,
    type: "add" | "remove",
    text: string,
  ) => void;
  triggerSelection: (file: TFile | null, editor: Editor) => void;
  openSettings: () => void;
  destroy: () => void;
}

/** observable class for obsidian related implementation to activate audio */
export class ObsidianBridgeImpl implements ObsidianBridge {
  active: MarkdownFileInfo | null = null;
  activeEditorView: MarkdownView | null;
  activeFilename: string | null = null;
  audio: AudioStore;
  app: App;

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
      setActiveEditor: mobx.action,
      onLayoutChange: mobx.action,
      onFileOpen: mobx.action,
    });
    this.app.workspace!.on("layout-change", this.onLayoutChange);
    this.app.workspace!.on("file-open", this.onFileOpen);
  }

  setActiveEditor = () => {
    this.active = this.app.workspace?.activeEditor || null;
    this.activeEditorView =
      this.app.workspace.getActiveViewOfType(MarkdownView);
    this.activeFilename = this.active?.file?.name || null;
  };

  onFileOpen = () => {
    const f = this.activeEditorView?.file;
    if (f && f.name !== this.activeFilename) {
      // if current window was replaced
      this.active = null;
      this.activeEditorView = null;
      this.activeFilename = null;
    }
  };

  onLayoutChange = () => {
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

  destroy: () => void = () => {
    this.app.workspace?.off("layout-change", this.onLayoutChange);
  };

  playSelectionIfAny() {
    this.setActiveEditor();
    const activeEditor = this.app.workspace.activeEditor;

    const maybeCursor = activeEditor?.editor?.getCursor("head");
    if (maybeCursor) {
      triggerSelection(this.audio, activeEditor!.file, activeEditor!.editor!);
    } else {
      new Notice("No text selected to speak");
    }
  }

  playSelection(): void {
    this.setActiveEditor();
    playSelectionIfAny(this.app, this.audio);
  }

  onTextChanged(position: number, type: "add" | "remove", text: string) {
    this.audio.activeText?.onTextChanged(position, type, text);
  }

  triggerSelection(file: TFile | null, editor: Editor) {
    this.setActiveEditor();
    triggerSelection(this.audio, file, editor);
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

async function playSelectionIfAny(app: App, audio: AudioStore): Promise<void> {
  const activeEditor = app.workspace.activeEditor;
  const maybeCursor = activeEditor?.editor?.getCursor("head");
  if (maybeCursor) {
    await triggerSelection(audio, activeEditor!.file, activeEditor!.editor!);
  } else {
    new Notice("No text selected to speak");
  }
}

async function triggerSelection(
  player: AudioStore,
  file: TFile | null,
  editor: Editor,
): Promise<void> {
  const from = editor.getCursor("from");
  let to = editor.getCursor("to");
  if (from.ch === to.ch && from.line === to.line) {
    to = {
      line: editor.lastLine(),
      ch: 0,
    };
  }
  const start = editor.getRange({ line: 0, ch: 0 }, from).length;

  const selection = editor.getRange(from, to);

  if (selection) {
    try {
      await player.startPlayer({
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
