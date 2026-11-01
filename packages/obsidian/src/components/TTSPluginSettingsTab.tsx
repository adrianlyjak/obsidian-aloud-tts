import { App, Plugin, PluginSettingTab } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { AudioStore } from "open-tts";
import { TTSPluginSettingsStore } from "open-tts";
import { SecretPickerContext, TTSSettingsTabComponent } from "@open-tts/ui";
import { obsidianSecretPicker } from "../util/keychain";
import { ObsidianTooltipProvider } from "../util/ObsidianTooltipService";

export class TTSSettingTab extends PluginSettingTab {
  settings: TTSPluginSettingsStore;
  mainPlayer: AudioStore;
  miniPlayer: AudioStore;
  wasPlaying: boolean = false;
  containerRoot: Root | null = null;

  constructor(
    app: App,
    plugin: Plugin,
    settings: TTSPluginSettingsStore,
    player: AudioStore,
  ) {
    super(app, plugin);
    this.settings = settings;
    this.mainPlayer = player;
  }

  display(): void {
    this.wasPlaying = this.mainPlayer.activeText?.isPlaying || false;
    const containerEl = this.containerEl;
    containerEl.empty();
    this.containerRoot = createRoot(containerEl);
    this.containerRoot.render(
      <ObsidianTooltipProvider>
        <SecretPickerContext.Provider value={obsidianSecretPicker(this.app)}>
          <TTSSettingsTabComponent
            store={this.settings}
            player={this.mainPlayer}
          />
        </SecretPickerContext.Provider>
      </ObsidianTooltipProvider>,
    );
  }
  hide() {
    super.hide();
    this.containerRoot?.unmount();
    this.containerRoot = null;
    if (this.wasPlaying) {
      this.mainPlayer.activeText?.play();
    }
  }
}
