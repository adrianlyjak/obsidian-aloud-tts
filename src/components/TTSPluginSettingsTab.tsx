import { App, Plugin, PluginSettingTab } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { AudioStore } from "../player/AudioStore";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";
import { TTSSettingsTabComponent } from "./TTSSettingsTabComponent";
import { ObsidianTooltipProvider } from "../util/ObsidianTooltipService";
import { PollyAuthSettingsStore } from "../player/PollyAuthSettings";
import { RuntimeServices } from "../player/RuntimeServices";

export class TTSSettingTab extends PluginSettingTab {
  settings: TTSPluginSettingsStore;
  pollyAuthSettings: PollyAuthSettingsStore;
  runtime: RuntimeServices;
  mainPlayer: AudioStore;
  miniPlayer: AudioStore;
  wasPlaying: boolean = false;
  containerRoot: Root | null = null;

  constructor(
    app: App,
    plugin: Plugin,
    settings: TTSPluginSettingsStore,
    pollyAuthSettings: PollyAuthSettingsStore,
    runtime: RuntimeServices,
    player: AudioStore,
  ) {
    super(app, plugin);
    this.settings = settings;
    this.pollyAuthSettings = pollyAuthSettings;
    this.runtime = runtime;
    this.mainPlayer = player;
  }

  display(): void {
    this.wasPlaying = this.mainPlayer.activeText?.isPlaying || false;
    const containerEl = this.containerEl;
    containerEl.empty();
    this.containerRoot = createRoot(containerEl);
    this.containerRoot.render(
      <ObsidianTooltipProvider>
        <TTSSettingsTabComponent
          store={this.settings}
          pollyAuthSettings={this.pollyAuthSettings}
          runtime={this.runtime}
          player={this.mainPlayer}
        />
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
