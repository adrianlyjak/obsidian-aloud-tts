import { observer } from "mobx-react-lite";
import { App, Plugin, PluginSettingTab } from "obsidian";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { AudioStore } from "src/player/Player";
import {
  REAL_OPENAI_API_URL,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { IconButton, IconSpan, Spinner } from "./IconButton";

export class TTSSettingTab extends PluginSettingTab {
  settings: TTSPluginSettingsStore;
  mainPlayer: AudioStore;
  miniPlayer: AudioStore;
  wasPlaying: boolean = false;

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
    createRoot(containerEl).render(
      <TTSSettingsTabComponent
        store={this.settings}
        player={this.mainPlayer}
      />,
    );
  }
  hide() {
    super.hide();
    if (this.wasPlaying) {
      this.mainPlayer.activeText?.play();
    }
  }
}

const TTSSettingsTabComponent: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
}> = observer(({ store, player }) => {
  const [isActive, setActive] = React.useState(false);
  return (
    <>
      <h1>Open AI TTS</h1>
      <APIKeyComponent store={store} />
      <VoiceComponent
        store={store}
        player={player}
        isActive={isActive}
        setActive={setActive}
      />
      <h1>Advanced</h1>
      <APIBaseURLComponent store={store} />
    </>
  );
});

const APIBaseURLComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateSettings({ OPENAI_API_URL: v.target.value });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">OpenAI API base URL</div>
        <div className="setting-item-description">
          Change to use a custom OpenAI compatible API server. Default is{" "}
          {REAL_OPENAI_API_URL}. Note: Token validation will be disabled if this
          is set
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type="text"
          placeholder={REAL_OPENAI_API_URL}
          value={store.settings.OPENAI_API_URL}
          onChange={onChange}
        />
      </div>
    </div>
  );
});

const APIKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [showPassword, setShowPassword] = React.useState(false);

  let validIcon: string;
  switch (store.apiKeyValid) {
    case true:
      validIcon = "check";
      break;
    case false:
      validIcon = "alert-circle";
      break;
    default:
      validIcon = "loader";
      break;
  }

  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateSettings({ OPENAI_API_KEY: v.target.value });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">OpenAI API key</div>
        <div className="setting-item-description">
          Your OpenAI API key. You can create one{" "}
          <a href="https://platform.openai.com/api-keys" target="_blank">
            here
          </a>
          .
        </div>
      </div>
      <div className="setting-item-control">
        {validIcon === "loader" ? <Spinner /> : <IconSpan icon={validIcon} />}
        <input
          type={showPassword ? "text" : "password"}
          placeholder="API Key"
          value={store.settings.OPENAI_API_KEY}
          onChange={onChange}
        />
        <IconButton
          icon={showPassword ? "eye-off" : "eye"}
          onClick={() => setShowPassword(!showPassword)}
        />
      </div>
    </div>
  );
});

const VoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
  isActive: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
}> = observer(({ store, player, isActive, setActive }) => {
  const isPlaying = player.activeText?.isPlaying && isActive;
  const playSample = React.useCallback(() => {
    if (!isPlaying) {
      const text = `Hi, I'm ${store.settings.ttsVoice}. I'm a virtual text to speech assistant.`;
      player.startPlayer({
        text,
        filename: "sample " + store.settings.ttsVoice,
        start: 0,
        end: text.length,
      });
      if (!isActive) {
        setActive(true);
      }
    } else {
      player.activeText?.pause();
    }
  }, [store.settings.ttsVoice, isPlaying]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <select
          className="dropdown"
          value={store.settings.ttsVoice}
          onChange={(v) => store.updateSettings({ ttsVoice: v.target.value })}
        >
          <option value="alloy">Alloy</option>
          <option value="echo">Echo</option>
          <option value="fable">Fable</option>
          <option value="onyx">Onyx</option>
          <option value="nova">Nova</option>
          <option value="shimmer">Shimmer</option>
        </select>
        <IconButton icon={isPlaying ? "pause" : "play"} onClick={playSample} />
      </div>
    </div>
  );
});
