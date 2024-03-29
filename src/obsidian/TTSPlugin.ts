import { TTSCodeMirror } from "../codemirror/TTSCodemirror";
import { obsidianStorage } from "./ObsidianPlayer";

import { Editor, MarkdownView, Plugin, addIcon } from "obsidian";
import { TTSSettingTab } from "../components/TTSPluginSettingsTab";
import { AudioSink, WebAudioSink } from "../player/AudioSink";
import { AudioStore, loadAudioStore } from "../player/Player";
import {
  MARKETING_NAME,
  MARKETING_NAME_LONG,
  TTSPluginSettingsStore,
  pluginSettingsStore,
} from "../player/TTSPluginSettings";
import { ObsidianBridge, ObsidianGlue } from "./ObsidianBridge";

// standard lucide.dev icon, but for some reason not working as a ribbon icon without registering it
// https://lucide.dev/icons/audio-lines
addIcon(
  "audio-lines",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-audio-lines"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>',
);

export default class TTSPlugin extends Plugin {
  settings: TTSPluginSettingsStore;

  player: AudioStore;
  audio: AudioSink;
  bridge: ObsidianBridge;

  async onload() {
    await this.loadSettings();

    // add right click menu to play selection
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle(`${MARKETING_NAME}: play selection`)
            .setIcon("play")
            .onClick(async () => {
              await this.bridge.triggerSelection(view.file, editor);
            });
        });
      }),
    );

    // Also add an editor command that can perform the same play selection
    this.addCommand({
      id: "play-selection",
      name: "Play selection",
      editorCheckCallback: (checking, editor: Editor, view: MarkdownView) => {
        if (checking) {
          return editor.getSelection().length > 0 || !!editor.getCursor("head");
        }
        this.bridge.triggerSelection(view.file, editor);
      },
    });

    // ribbon
    this.addRibbonIcon("audio-lines", MARKETING_NAME_LONG, () =>
      this.bridge.playSelectionIfAny(),
    );

    // This adds a simple command that can be triggered anywhere to resume last track
    this.addCommand({
      id: "resume",
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
      id: "pause",
      name: "Pause",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.player.activeText?.pause();
      },
    });

    this.registerEditorExtension(
      TTSCodeMirror(this.player, this.settings, this.audio, this.bridge),
    );

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(
      new TTSSettingTab(this.app, this, this.settings, this.player),
    );
  }

  onunload() {
    this.player?.destroy(); // player clears the audio
    this.bridge?.destroy();
  }

  async loadSettings() {
    this.settings = await pluginSettingsStore(
      () => this.loadData(),
      (data) => this.saveData(data),
    );
    this.audio = new WebAudioSink();
    this.player = await loadAudioStore({
      settings: this.settings.settings,
      storage: obsidianStorage(this.app),
      audioSink: this.audio,
    });
    this.bridge = new ObsidianGlue(this.app, this.player);
  }
}
