import * as mobx from "mobx";
import { EditorView } from "@codemirror/view";
import { App, Editor, Notice, TFile } from "obsidian";
import { AudioStore } from "src/player/Player";

export interface ObsidianBridge {
  activeEditor: EditorView | undefined;
  playSelection: () => void;
  openSettings: () => void;
}

export class ObsidianGlue implements ObsidianBridge {
  activeEditor: EditorView | undefined = undefined;
  audio: AudioStore;
  app: App;

  constructor(app: App, audio: AudioStore) {
    this.audio = audio;
    this.app = app;
    mobx.makeObservable(this, {
      activeEditor: mobx.observable.ref,
      extractEditor: mobx.action,
    });

    app.workspace!.on("active-leaf-change", this.extractEditor);
    this.extractEditor();
  }
  extractEditor = () => {
    // @ts-expect-error
    const editor = app.workspace?.activeEditor?.editor?.cm as
      | EditorView
      | undefined;
    this.activeEditor = editor;
  };

  playSelectionIfAny() {
    const activeEditor = this.app.workspace.activeEditor;
    const maybeCursor = activeEditor?.editor?.getCursor("head");
    if (maybeCursor) {
      triggerSelection(this.audio, activeEditor!.file, activeEditor!.editor!);
    } else {
      new Notice("No Text Selected To Speak");
    }
  }

  playSelection(): void {
    playSelectionIfAny(this.app, this.audio);
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

export async function playSelectionIfAny(
  app: App,
  audio: AudioStore
): Promise<void> {
  const activeEditor = app.workspace.activeEditor;
  const maybeCursor = activeEditor?.editor?.getCursor("head");
  if (maybeCursor) {
    await triggerSelection(audio, activeEditor!.file, activeEditor!.editor!);
  } else {
    new Notice("No Text Selected To Speak");
  }
}

export async function triggerSelection(
  player: AudioStore,
  file: TFile | null,
  editor: Editor
): Promise<void> {
  let selection = editor.getSelection();
  const maybeCursor = editor.getCursor("head");

  if (!selection && maybeCursor) {
    selection = editor.getRange(maybeCursor, {
      line: maybeCursor.line + 4096,
      ch: 0,
    });
  }

  if (selection) {
    try {
      await player.startPlayer({
        text: selection,
        filename:
          [file?.path, file?.name].filter((x) => x).join("/") || "Untitled",
      });
    } catch (ex) {
      console.error("problems!", ex);
    }
  } else {
    new Notice("No Text Selected To Speak");
  }
}
