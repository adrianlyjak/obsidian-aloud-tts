import { EditorView } from "@codemirror/view";
import { obsidianStorage } from "./ObsidianPlayer";
import { TTSCodeMirror } from "../codemirror/TTSCodemirror";

import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  addIcon,
} from "obsidian";
import { AudioStore, loadAudioStore } from "../player/Player";
import { AudioSink } from "../player/AudioSink";
import {
  MARKETING_NAME,
  pluginSettingsStore,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { TTSSettingTab } from "../components/TTSPluginSettingsTab";

// standard lucide.dev icon, but for some reason not working as a ribbon icon without registering it
// https://lucide.dev/icons/audio-lines
addIcon(
  "audio-lines",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-audio-lines"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>'
);

export default class TTSPlugin extends Plugin {
  settings: TTSPluginSettingsStore;

  player: AudioStore;
  audio: AudioSink;

  async onload() {
    await this.loadSettings();

    // add right click menu to play selection
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle(`${MARKETING_NAME}: Play Selection`)
            .setIcon("play")
            .onClick(async () => {
              await triggerSelection(this.player, view.file, editor);
            });
        });
      })
    );

    // Also add an editor command that can perform the same play selection
    this.addCommand({
      id: "tts-play-selection",
      name: "Play Selection",
      editorCheckCallback: (checking, editor: Editor, view: MarkdownView) => {
        if (checking) {
          return editor.getSelection().length > 0 || !!editor.getCursor("head");
        }
        triggerSelection(this.player, view.file, editor);
      },
    });

    // ribbon
    this.addRibbonIcon("audio-lines", MARKETING_NAME, () =>
      playSelectionIfAny(this.player, this.app)
    );

    // This adds a simple command that can be triggered anywhere to resume last track
    this.addCommand({
      id: "tts-resume",
      name: "Resume",
      checkCallback: (checking) => {
        const active = this.player.activeText;
        if (checking) {
          return !!active;
        }
        this.player.activeText?.play();
      },
    });

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: "tts-pause",
      name: "Pause",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.player.activeText?.pause();
      },
    });

    this.registerEditorExtension(
      TTSCodeMirror(this.player, this.settings, this.audio, {
        currentCodeMirror: () => {
          // @ts-expect-error
          const editor = this.app.workspace?.activeEditor?.editor?.cm as
            | EditorView
            | undefined;
          return editor;
        },
        playSelection: () => playSelectionIfAny(this.player, this.app),
        openSettings: () => {
          // big ugly hack. There's hopefully a better way to do this
          (this.app as any)?.commands?.commands?.[
            "app:open-settings"
          ]?.callback?.();
        },
      })
    );

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(
      new TTSSettingTab(this.app, this, this.settings, this.player)
    );
  }

  onunload() {
    this.audio?.clearAudio();
  }

  async loadSettings() {
    this.settings = await pluginSettingsStore(
      () => this.loadData(),
      (data) => this.saveData(data)
    );
    this.player = await loadAudioStore({
      settings: this.settings.settings,
      storage: obsidianStorage(this.app),
    });
    this.audio = AudioSink(this.player);
  }
}

////////////////////////////////////////
// Obsidian+Business Logic Glue

function playSelectionIfAny(player: AudioStore, app: App) {
  const activeEditor = app.workspace.activeEditor;
  const maybeCursor = activeEditor?.editor?.getCursor("head");
  if (maybeCursor) {
    triggerSelection(player, activeEditor!.file, activeEditor!.editor!);
  } else {
    new Notice("No Text Selected To Speak");
  }
}

async function triggerSelection(
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
