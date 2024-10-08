import { observer } from "mobx-react-lite";
import { App, Plugin, PluginSettingTab } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { AudioStore } from "../player/Player";
import {
  ModelProvider,
  PlayerViewMode,
  REAL_OPENAI_API_URL,
  TTSPluginSettingsStore,
  isPlayerViewMode,
  modelProviders,
  playViewModes,
} from "../player/TTSPluginSettings";
import { IconButton, IconSpan, Spinner } from "./IconButton";
import { TTSErrorInfoDetails, TTSErrorInfoView } from "./PlayerView";

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
      <TTSSettingsTabComponent
        store={this.settings}
        player={this.mainPlayer}
      />,
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

const TTSSettingsTabComponent: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
}> = observer(({ store, player }) => {
  const [isActive, setActive] = React.useState(false);
  return (
    <>
      <h1>OpenAI</h1>
      <ErrorInfoView player={player} />
      <TestVoiceComponent
        store={store}
        player={player}
        isActive={isActive}
        setActive={setActive}
      />
      <ModelSwitcher store={store} />

      {store.settings.modelProvider === "openai" ? (
        <>
          <OpenAIApiKeyComponent store={store} />
          <OpenAIModelComponent store={store} />
          <OpenAIVoiceComponent store={store} />
        </>
      ) : (
        <>
          <OpenAICompatibleApiKeyComponent store={store} />
          <APIBaseURLComponent store={store} />
          <CustomVoices store={store} />
        </>
      )}

      <h1>User Interface</h1>
      <PlayerDisplayMode store={store} />
      <h1>Cache</h1>
      <CacheDuration store={store} player={player} />
    </>
  );
});

const ErrorInfoView: React.FC<{
  player: AudioStore;
}> = observer(({ player }) => {
  return (
    <div className="tts-settings-error-container">
      {player.activeText?.error && (
        <details>
          <summary>
            <div className="tts-settings-error-summary">
              <span className="setting-item-description">
                Most Recent Error Details
              </span>
              <TTSErrorInfoView error={player.activeText.error} />
            </div>
          </summary>
          <TTSErrorInfoDetails error={player.activeText.error} />
        </details>
      )}
    </div>
  );
});

const labels: Record<ModelProvider, string> = {
  openai: "OpenAI",
  openaicompat: "OpenAI Compatible (Advanced)",
};

const ModelSwitcher: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Model Provider</div>
        <div className="setting-item-description">
          The model provider to use
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={modelProviders.map((v) => ({ label: labels[v], value: v }))}
          value={store.settings.modelProvider}
          onChange={(v) =>
            store.updateSettings({ modelProvider: v as ModelProvider })
          }
        />
      </div>
    </div>
  );
});

function humanFileSize(size: number) {
  const i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    +(size / Math.pow(1024, i)).toFixed(2) * 1 +
    " " +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
}

function describeMode(mode: PlayerViewMode): string {
  switch (mode) {
    case "always":
      return "Always show";
    case "always-mobile":
      return "Always show on mobile";
    case "playing":
      return "Only while playing";
    case "never":
      return "Never show";
  }
}
const PlayerDisplayMode: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Show player toolbar</div>
        <div className="setting-item-description">
          Show the player toolbar under these conditions
        </div>
      </div>
      <div className="setting-item-control">
        <select
          value={store.settings.showPlayerView}
          onChange={(e) => {
            const value = e.target.value;
            if (isPlayerViewMode(value)) {
              store.updateSettings({ showPlayerView: value });
            } else {
              console.error("invalid player view mode", value);
            }
          }}
        >
          {playViewModes.map((mode) => (
            <option key={mode} value={mode}>
              {describeMode(mode)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});

const CacheDuration: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
}> = observer(({ store, player }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateSettings({
        cacheDurationMillis: +v.target.value * 1000 * 60 * 60,
      });
    }, []);
  const [cacheSize, setCacheSize] = React.useState<{
    loading: boolean;
    size: number;
  }>({ loading: true, size: 0 });
  const setLoading = React.useCallback(() => {
    setCacheSize({ loading: true, size: 0 });
  }, []);
  React.useEffect(() => {
    if (cacheSize.loading) {
      player
        .getStorageSize()
        .then((size) => {
          setCacheSize({ loading: false, size });
        })
        .catch((e) => {
          console.error("error getting cache size", e);
          setCacheSize({ loading: false, size: 0 });
        });
    }
  }, [cacheSize.loading]);

  const [isConfirming, setIsConfirming] = React.useState(false);
  const confirmClear = React.useCallback(() => {
    setIsConfirming(false);
  }, []);
  const confirm = React.useCallback(() => {
    setIsConfirming(true);
  }, []);
  const clearStorage = React.useCallback(() => {
    confirmClear();
    player.clearStorage().then(() => {
      setCacheSize({ loading: false, size: 0 });
    });
  }, []);

  const setCacheType: React.ChangeEventHandler<HTMLSelectElement> =
    React.useCallback((event) => {
      store.updateSettings({
        cacheType: event.target.value as "local" | "vault",
      });
      setCacheSize({ loading: true, size: 0 });
    }, []);
  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Cache type</div>
          <div className="setting-item-description">
            Local device based cache (recommended), or a vault based cache that
            is shared across devices.
            <br />
            Device local cache is recommended to avoid sync overhead
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={store.settings.cacheType}
            onChange={setCacheType}
          >
            <option value="local">Local</option>
            <option value="vault">Vault</option>
          </select>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Cache duration</div>
          <div className="setting-item-description">
            Cache duration in hours. Audio snippets will be purged and
            re-requested after this duration
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="number"
            value={Math.round(
              store.settings.cacheDurationMillis / 1000 / 60 / 60,
            )}
            onChange={onChange}
          />
          <span className="setting-item-description">hours</span>
        </div>
      </div>
      {/* And a line that shows the current cache usage  as well as a button to clear it */}
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Cache Disk Usage</div>
          <div className="setting-item-description">
            {cacheSize.loading ? <Spinner /> : humanFileSize(cacheSize.size)}
          </div>
        </div>
        <div className="setting-item-control">
          {isConfirming ? (
            <>
              <button onClick={confirmClear}>Cancel</button>
              <button
                style={{ backgroundColor: "var(--background-modifier-error)" }}
                onClick={clearStorage}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <IconButton
                tooltip="Reload"
                icon="rotate-cw"
                onClick={setLoading}
              />
              <IconButton
                tooltip="Clear cache"
                icon="trash"
                onClick={confirm}
              />
            </>
          )}
        </div>
      </div>
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
        <div className="setting-item-name">API URL</div>
        <div className="setting-item-description">
          Base url for openai compatible API
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

const CustomVoices: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Model</div>
          <div className="setting-item-description">The model parameter</div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={store.settings.model}
            onChange={(evt) =>
              store.updateSettings({ model: evt.target.value })
            }
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Custom OpenAI Voice</div>
          <div className="setting-item-description">The voice parameter</div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={store.settings.ttsVoice}
            onChange={(evt) =>
              store.updateSettings({ ttsVoice: evt.target.value })
            }
          />
        </div>
      </div>
    </>
  );
});

const OpenAIApiKeyComponent: React.FC<{
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
      store.updateModelSpecificSettings("openai", {
        openai_apiKey: v.target.value,
      });
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
          value={store.settings.openai_apiKey}
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

const OpenAICompatibleApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [showPassword, setShowPassword] = React.useState(false);

  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateSettings({ OPENAI_API_KEY: v.target.value });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">API key</div>
        <div className="setting-item-description">
          A Bearer token for your API
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="API Key"
          value={store.settings.openaicompat_apiKey}
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

const DEFAULT_MODELS = [
  { label: "tts-1", value: "tts-1" },
  { label: "tts-1-hd", value: "tts-1-hd" },
] as const;

const DEFAULT_VOICES = [
  { label: "Alloy", value: "alloy" },
  { label: "Echo", value: "echo" },
  { label: "Fable", value: "fable" },
  { label: "Onyx", value: "onyx" },
  { label: "Nova", value: "nova" },
  { label: "Shimmer", value: "shimmer" },
] as const;

const OpenAIModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Model</div>
        <div className="setting-item-description">
          The OpenAI TTS model to use
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_MODELS}
          value={store.settings.openai_ttsModel}
          onChange={(v) =>
            store.updateModelSpecificSettings("openai", {
              openai_ttsModel: v,
            })
          }
        />
      </div>
    </div>
  );
});

const OpenAIVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_VOICES}
          value={store.settings.ttsVoice}
          onChange={(v) =>
            store.updateModelSpecificSettings("openai", {
              openai_ttsVoice: v,
            })
          }
        />
      </div>
    </div>
  );
});

const TestVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
  isActive: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
}> = observer(({ store, player, isActive, setActive }) => {
  const isPlaying = player.activeText?.isPlaying && isActive;
  const isLoading = player.activeText?.isLoading;
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
        <div className="setting-item-name">Test Voice</div>
        <div className="setting-item-description">
          Test the voice to see how it sounds
        </div>
      </div>
      <div className="setting-item-control">
        <button onClick={playSample}>
          {isLoading ? (
            <Spinner style={{ marginRight: "0.5em" }} delay={250} />
          ) : (
            <IconSpan
              style={{ marginRight: "0.5em" }}
              icon={isPlaying ? "pause" : "play"}
            />
          )}{" "}
          Test Voice
        </button>
      </div>
    </div>
  );
});

const OptionSelect: React.FC<{
  options: readonly { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => {
  const isUnknown = options.find((o) => o.value === value) === undefined;
  const unknownValue = isUnknown && !!value ? [{ label: value, value }] : [];
  return (
    <>
      <select
        className="dropdown"
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
      >
        {options.concat(unknownValue).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
};
