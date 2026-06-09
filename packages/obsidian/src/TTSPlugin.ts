import { TTSCodeMirror } from "./TTSCodemirror";
import { createPlayerSynchronizer } from "@open-tts/ui";

import { Editor, MarkdownView, Notice, Plugin, addIcon } from "obsidian";
import { REGISTRY } from "open-tts";
import { TTSSettingTab } from "./components/TTSPluginSettingsTab";
import { AudioSink } from "open-tts";
import { WebAudioSink } from "open-tts/browser";
import { AudioStore, loadAudioStore } from "open-tts";
import { AudioSystem, createAudioSystem } from "open-tts";
import { ChunkLoader } from "open-tts";
import {
  MARKETING_NAME,
  TTSPluginSettings,
  TTSPluginSettingsStore,
  pluginSettingsStore,
} from "open-tts";
import { ObsidianBridge, ObsidianBridgeImpl } from "./ObsidianBridge";
import { configurableAudioCache } from "./ObsidianPlayer";
import {
  AudioTextContext,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "open-tts";
import * as mobx from "mobx";
import { TTSEditorAction } from "./TTSEditorAction";

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
  editorAction: TTSEditorAction | undefined;
  private _playerSyncDisposer: (() => void) | undefined;
  private _errorNoticeDisposer: (() => void) | undefined;

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
                forceRestart: true,
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
      id: "save-document-audio",
      name: "Save document as audio",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const busy = !!this.player.exportProgress;
        if (checking) {
          return !!view && !busy;
        }
        this.bridge.saveDocumentAudio().catch((ex) => {
          console.error("Couldn't save document audio!", ex);
        });
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

    // Editor action button - always present, behavior differs by platform
    this.editorAction = new TTSEditorAction(
      this,
      this.player,
      this.settings,
      this.bridge,
      this.audio,
    );
    this.editorAction.register();

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

    // track navigation
    this.addCommand({
      id: "next-track",
      name: "Next track",
      checkCallback: (checking) => {
        const hasActive = !!this.player.activeText;
        if (checking) {
          return hasActive;
        }
        this.player.activeText?.goToNext();
      },
    });

    this.addCommand({
      id: "previous-track",
      name: "Previous track",
      checkCallback: (checking) => {
        const hasActive = !!this.player.activeText;
        if (checking) {
          return hasActive;
        }
        this.player.activeText?.goToPrevious();
      },
    });

    this.addCommand({
      id: "seek-backward-15",
      name: "Seek backward 15 seconds",
      checkCallback: (checking) => {
        if (checking) return !!this.player.activeText;
        const before = this.audio.currentTime;
        const target = before - 15;
        if (target < 0) {
          this.player.activeText?.goToPrevious();
        } else {
          this.audio.currentTime = target;
        }
      },
    });

    this.addCommand({
      id: "seek-forward-15",
      name: "Seek forward 15 seconds",
      checkCallback: (checking) => {
        if (checking) return !!this.player.activeText;
        this.audio.currentTime = this.audio.currentTime + 15;
      },
    });

    this.addCommand({
      id: "toggle-autoscroll",
      name: "Toggle autoscroll focus",
      checkCallback: (checking) => {
        const hasSettings = !!this.settings;
        if (checking) {
          return hasSettings;
        }
        const newValue = !this.player.autoScrollEnabled;
        if (newValue) {
          this.player.enableAutoScrollAndScrollToCurrent();
        } else {
          this.player.disableAutoScroll();
        }
        // Persist the setting
        this.settings.updateSettings({ autoScrollPlayerView: newValue });
      },
    });

    this._playerSyncDisposer = createPlayerSynchronizer(
      this.player,
      this.bridge,
    );

    // Show a Notice whenever the active track enters an error state so the
    // user gets a clear signal even if they're not looking at the toolbar.
    let lastErrorNoticeTime = 0;
    this._errorNoticeDisposer = mobx.reaction(
      () => this.player.activeText?.error,
      (error) => {
        if (!error) return;
        // Debounce to at most 1 notice every 5 s (multiple chunks can fail).
        const now = Date.now();
        if (now - lastErrorNoticeTime < 5_000) return;
        lastErrorNoticeTime = now;
        new Notice(formatTTSError(error), 8000);
      },
    );
    this.registerEditorExtension(
      TTSCodeMirror(this.player, this.settings, this.audio, this.bridge),
    );

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(
      new TTSSettingTab(this.app, this, this.settings, this.player),
    );

    // Health check for Chatterbox
    if (this.settings.settings.modelProvider === "chatterbox") {
      REGISTRY.chatterbox
        .validateConnection(this.settings.settings)
        .then((error) => {
          if (error) {
            new Notice(error, 0); // Persistent notice
          }
        });
    }
  }

  onunload() {
    this.editorAction?.destroy();
    this._playerSyncDisposer?.();
    this._errorNoticeDisposer?.();
    this.player?.destroy();
    this.audio?.destroy();
    this.bridge?.destroy();
    this.cache?.destroy();
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
      audioStore: (sys) => loadAudioStore({ system: sys }),
      storage: () => cache,
      ttsModel: (system) => ProxiedTTSModel(system.settings),
      chunkLoader: (system) => new ChunkLoader({ system }),
      config: () => ({
        backgroundLoaderIntervalMillis: 1000,
      }),
    });
    this.bridge = new ObsidianBridgeImpl(this.app, this.player, this.settings);
  }
}

function ProxiedTTSModel(settings: TTSPluginSettings): TTSModel {
  const getModel = () => {
    return REGISTRY[settings.modelProvider];
  };
  return {
    call: (
      text: string,
      options: TTSModelOptions,
      settings: TTSPluginSettings,
      context?: AudioTextContext,
      signal?: AbortSignal,
    ) => {
      return getModel().call(text, options, settings, context, signal);
    },
    validateConnection: (settings: TTSPluginSettings) => {
      return getModel().validateConnection(settings);
    },
    convertToOptions: (settings: TTSPluginSettings) => {
      return getModel().convertToOptions(settings);
    },
  };
}

function formatTTSError(error: TTSErrorInfo): string {
  const detail = error.ttsJsonMessage() ?? error.message;
  if (error.httpErrorCode === 429) {
    return `Aloud: Rate limited — waiting before retrying. (${detail})`;
  }
  if (error.httpErrorCode === 401 || error.httpErrorCode === 403) {
    return `Aloud: API key error — ${detail}. Check plugin settings.`;
  }
  if (error.httpErrorCode === 404) {
    return `Aloud: Model not found — ${detail}. Check the model name in settings.`;
  }
  if (error.httpErrorCode && error.httpErrorCode >= 500) {
    return `Aloud: Server error (${error.httpErrorCode}) — ${detail}`;
  }
  return `Aloud: Audio generation failed — ${detail}`;
}
