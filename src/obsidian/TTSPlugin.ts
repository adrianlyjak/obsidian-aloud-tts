import { TTSCodeMirror } from "../codemirror/TTSCodemirror";

import { Editor, MarkdownView, Notice, Plugin, addIcon } from "obsidian";
import { TTSSettingTab } from "../components/TTSPluginSettingsTab";
import { AudioSink, WebAudioSink } from "../player/AudioSink";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import { AudioSystem, createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import {
  MARKETING_NAME,
  MARKETING_NAME_LONG,
  TTSPluginSettingsStore,
  pluginSettingsStore,
} from "../player/TTSPluginSettings";
import { ObsidianBridge, ObsidianBridgeImpl } from "./ObsidianBridge";
import { configurableAudioCache } from "./ObsidianPlayer";
import { 
  geminiTextToSpeech,
  humeTextToSpeech,
  openAITextToSpeech
} from "../player/TTSModel";

// standard lucide.dev icon, but for some reason not working as a ribbon icon without registering it
// https://lucide.dev/icons/audio-lines
addIcon(
  "audio-lines",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-audio-lines"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>',
);

export default class TTSPlugin extends Plugin {
  settings: TTSPluginSettingsStore;

  system: AudioSystem;
  bridge: ObsidianBridge;
  cache: { destroy: () => void } | undefined;

  get player(): AudioStore {
    return this.system.audioStore;
  }

  get audio(): AudioSink {
    return this.system.audioSink;
  }

  async onload() {
    await this.loadSettings();

    // add right click menu to play selection
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle(`${MARKETING_NAME}: Play selection`)
            .setIcon("play")
            .onClick(async () => {
              await this.bridge.triggerSelection(view.file, editor, {
                extendShort: true,
              });
            });
        });
        menu.addItem((item) => {
          item
            .setTitle(`${MARKETING_NAME}: Paste text to audio`)
            .setIcon("clipboard")
            .onClick(async () => {
              const text = await navigator.clipboard.readText();
              this.bridge.exportAudio(text, true);
            });
        });
        menu.addItem((item) => {
          item
            .setTitle(`${MARKETING_NAME}: Export selection to audio`)
            .setIcon("file-audio")
            .onClick(async () => {
              const text = editor.getSelection();
              this.bridge.exportAudio(text, false);
            });
        });
      }),
    );

    // Also add an editor command that can perform the same play selection
    // This will always initiate a new audio
    this.addCommand({
      id: "play-selection",
      name: "Play selection",
      editorCheckCallback: (checking, editor: Editor, view: MarkdownView) => {
        if (checking) {
          return true;
        }
        this.bridge.triggerSelection(view.file, editor);
      },
    });
    this.addCommand({
      id: "play-clipboard",
      name: "Play from clipboard",
      editorCheckCallback: (checking, editor: Editor, view: MarkdownView) => {
        if (checking) {
          return true;
        }
        navigator.clipboard
          .readText()
          .then((text) => {
            this.bridge.playDetached(text);
          })
          .catch((ex) => {
            console.error("Failed to play clipboard audio", ex);
            new Notice("Failed to get data from clipboard");
          });
      },
    });

    // ribbon
    this.addRibbonIcon("audio-lines", MARKETING_NAME_LONG, () =>
      this.bridge.playSelection(),
    );

    // this pause/resumes the current audio, or initiates a new audio if nothing is playing
    this.addCommand({
      id: "play-pause",
      name: "Play/pause",
      checkCallback: (checking) => {
        const active = this.player.activeText;
        if (checking) {
          return true;
        }
        if (!active) {
          this.bridge.playSelection();
        } else if (this.player.activeText?.isPlaying) {
          this.player.activeText?.pause();
        } else {
          this.player.activeText?.play();
        }
      },
    });

    this.addCommand({
      id: "increase-playback-speed",
      name: "Increase playback speed",
      checkCallback: (checking) => {
        if (checking) {
          return this.settings.settings.playbackSpeed < 2.5;
        }
        this.settings.setSpeed(this.settings.settings.playbackSpeed + 0.1);
      },
    });

    this.addCommand({
      id: "decrease-playback-speed",
      name: "Decrease playback speed",
      checkCallback: (checking) => {
        if (checking) {
          return this.settings.settings.playbackSpeed > 0.5;
        }
        this.settings.setSpeed(this.settings.settings.playbackSpeed - 0.1);
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

    const audio = await WebAudioSink.create();
    const cache = configurableAudioCache(this.app, this.settings);
    this.cache = cache;
    this.system = createAudioSystem({
      settings: () => this.settings.settings,
      audioSink: () => audio,
      audioStore: (sys) => loadAudioStore({ system: sys, }),
      storage: () => cache,
      ttsModel: (system) => {
        switch (system.settings.modelProvider) {
          case "gemini":
            return geminiTextToSpeech;
          case "hume":
            return humeTextToSpeech;
          default:
            return openAITextToSpeech;
        }
      },
      chunkLoader: (system) => new ChunkLoader({ system }),
      config: () => ({
        backgroundLoaderIntervalMillis: 1000,
      }),
    });
    this.bridge = new ObsidianBridgeImpl(this.app, this.player, this.settings);
  }
}
