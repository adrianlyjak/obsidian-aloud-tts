import { observer } from "mobx-react-lite";
import { App, Plugin, PluginSettingTab } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { AudioStore } from "../player/AudioStore";
import {
  ModelProvider,
  PlayerViewMode,
  OPENAI_API_URL,
  MARKETING_NAME,
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
      <h1>{MARKETING_NAME}</h1>
      <ErrorInfoView player={player} />
      <TestVoiceComponent
        store={store}
        player={player}
        isActive={isActive}
        setActive={setActive}
      />
      <ModelSwitcher store={store} />
      {store.settings.modelProvider === "gemini" && (
        <>
        <h1>Google Gemini</h1>
          <GeminiApiKeyComponent store={store} />
          <GeminiModelComponent store={store} />
          <GeminiVoiceComponent store={store} />
          <GeminiTTSInstructionsComponent store={store} />
          <GeminiContextModeComponent store={store} />
        </>
      )}
      {store.settings.modelProvider === "hume" &&(
        <>
          <h1>Hume</h1>
          <HumeApiKeyComponent store={store} />
          <HumeProviderComponent store={store} />
          <HumeVoiceComponent store={store} />
          <HumeTTSInstructionsComponent store={store} />
          <HumeContextModeComponent store={store} />
        </>
      )}
      {store.settings.modelProvider === "openai" && (
        <>
        <h1>OpenAI</h1>
          <OpenAIApiKeyComponent store={store} />
          <OpenAIModelComponent store={store} />
          <OpenAIVoiceComponent store={store} />
          <OpenAITTSInstructionsComponent store={store} />
          <OpenAIContextModeComponent store={store} />
        </>
      )}
      {store.settings.modelProvider === "openaicompat" && (
        <>
          <h1>OpenAI Compatible API</h1>
          <OpenAICompatibleApiKeyComponent store={store} />
          <OpenAICompatibleAPIBaseURLComponent store={store} />
          <OpenAICompatibleVoiceComponent store={store} />
        </>
      )}

      <h1>User Interface</h1>
      <PlayerDisplayMode store={store} />
      <h1>Storage</h1>
      <CacheDuration store={store} player={player} />
      <AudioFolderComponent store={store} />
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
  gemini: "Google Gemini",
  hume: "Hume",
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
          onChange={(v) => store.updateModelSpecificSettings(v as ModelProvider, {})}
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

const AudioFolderComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  function cleanFolderName(folder: string) {
    return folder.replace(/\/$/g, "");
  }
  const [state, setState] = React.useState({
    clean: cleanFolderName(store.settings.audioFolder),
    external: store.settings.audioFolder,
    raw: store.settings.audioFolder,
  });
  React.useEffect(() => {
    if (state.external !== state.clean) {
      setState({
        clean: cleanFolderName(store.settings.audioFolder),
        external: store.settings.audioFolder,
        raw: store.settings.audioFolder,
      });
    }
  }, [store.settings.audioFolder]);
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (v: React.ChangeEvent<HTMLInputElement>) => {
        const clean = cleanFolderName(v.target.value).trim();
        store.updateSettings({ audioFolder: clean });
        setState({
          clean,
          external: state.external,
          raw: v.target.value,
        });
      },
      [JSON.stringify(state)],
    );

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Audio Folder</div>
        <div className="setting-item-description">
          The folder to store audio files
        </div>
      </div>
      <div className="setting-item-control">
        <input type="text" value={state.raw} onChange={onChange} />
      </div>
    </div>
  );
});

const APIBaseURLComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  function isValidURL(url: string) {
    if (!url) {
      return true;
    }
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
  const [state, setState] = React.useState({
    raw: store.settings.API_URL,
    valid: isValidURL(store.settings.API_URL),
  });
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      const url = v.target.value;
      const valid = isValidURL(url);
      setState({
        raw: url,
        valid,
      });
      if (valid) {
        store.updateSettings({ API_URL: url });
      }
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
          value={state.raw}
          onChange={onChange}
          className={!state.valid ? "tts-error-input" : ""}
        />
        {!state.valid && state.raw && (
          <div className="setting-item-description tts-error-text">
            Please enter a valid URL (e.g. https://api.example.com)
          </div>
        )}
      </div>
    </div>
  );
});

const CustomVoices: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
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

const HumeProviderComponent: React.FC<{ store: TTSPluginSettingsStore }> = observer(({ store }) => {
  const providerOptions = [
    { label: "Hume", value: "HUME_AI" },
    { label: "Custom Voice", value: "CUSTOM_VOICE" },
  ];
  const onChange = React.useCallback(
    (v: string) => {
      store.updateModelSpecificSettings("hume", {
        hume_sourceType: v,
      });
    },
    [store],
  );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Provider</div>
        <div className="setting-item-description">
          Choose between Hume's preset voices or your own custom voices.
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={providerOptions}
          value={store.settings.hume_sourceType}
          onChange={onChange}
        />
      </div>
    </div>
  );
});
const HumeApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateModelSpecificSettings("hume", {
        hume_apiKey: v.target.value,
      });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Hume API key</div>
        <div className="setting-item-description">
          Your Hume API key. You can get one{" "}
          <a href="https://platform.hume.ai/settings/keys" target="_blank">
            here
          </a>
          .
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="API Key"
          value={store.settings.hume_apiKey}
          onChange={onChange}
        />
        <IconButton icon={showPassword ? "eye-off" : "eye"} onClick={() => setShowPassword(!showPassword)} />
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
      store.updateSettings({ openaicompat_apiKey: v.target.value });
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

const DEFAULT_MODELS: Model[] = [
  { label: "tts-1", value: "tts-1" },
  { label: "tts-1-hd", value: "tts-1-hd" },
  {
    label: "gpt-4o-mini-tts",
    value: "gpt-4o-mini-tts",
    supportsInstructions: true,
  },
] as const;

interface Model {
  label: string;
  value: string;
  supportsInstructions?: boolean;
}

interface Voice {
  label: string;
  value: string;
  models: string[];
}
const DEFAULT_VOICES: Voice[] = [
  {
    label: "Alloy",
    value: "alloy",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Ash",
    value: "ash",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  { label: "Ballad", value: "ballad", models: ["gpt-4o-mini-tts"] },
  {
    label: "Coral",
    value: "coral",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Echo",
    value: "echo",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Fable",
    value: "fable",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Onyx",
    value: "onyx",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Nova",
    value: "nova",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Sage",
    value: "sage",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Shimmer",
    value: "shimmer",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  { label: "Verse", value: "verse", models: ["gpt-4o-mini-tts"] },
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
  const voices = React.useMemo(() => {
    return DEFAULT_VOICES.filter((v) =>
      v.models.includes(store.settings.openai_ttsModel),
    );
  }, [store.settings.openai_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.openai_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("openai", {
      openai_ttsVoice: voices[0].value,
    });
  }, [store.settings.openai_ttsVoice, voices]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_VOICES}
          value={store.settings.openai_ttsVoice}
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

const HumeModelComponent: React.FC<{ store: TTSPluginSettingsStore }> = observer(({ store }) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const onChange: React.ChangeEventHandler<HTMLInputElement> = React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
    store.updateModelSpecificSettings("hume", {
      hume_apiKey: v.target.value,
    });
  }, []);
  return (<div className="setting-item">
    <div className="setting-item-info">
      <div className="setting-item-name">Hume API key</div>
      <div className="setting-item-description">Your Hume API key. You can get one <a href="https://platform.hume.ai/settings/keys" target="_blank"> here </a>. </div>
    </div>
    <div className="setting-item-control">
      <input type={showPassword ? "text" : "password"} placeholder="API Key" value={store.settings.hume_apiKey} onChange={onChange} />
      <IconButton icon={showPassword ? "eye-off" : "eye"} onClick={() => setShowPassword(!showPassword)} />
    </div>
  </div>);
});
const HumeVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (<div className="setting-item"> <div className="setting-item-info"> <div className="setting-item-name">Hume Voice ID</div> <div className="setting-item-description">The Hume Voice ID to use</div> </div> <input type="text" value={store.settings.hume_ttsVoice} onChange={(v) => store.updateModelSpecificSettings("hume", {hume_ttsVoice: v.target.value})} /> </div>);
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
      if (store.settings.modelProvider === "hume") {
        const text = `Hi, I'm Hume AI. I'm a virtual text to speech assistant.`;
        player.startPlayer({
          text,
          filename: "sample " + store.settings.ttsVoice,
          start: 0,
          end: text.length,
        });
      } else {
        const text = `Hi, I'm ${store.settings.ttsVoice}. I'm a virtual text to speech assistant.`;
        player.startPlayer({
          text,
          filename: "sample " + store.settings.ttsVoice,
          start: 0,
          end: text.length,
        });
      }
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

interface Model {
  label: string;
  value: string;
  supportsInstructions?: boolean;
}

const GeminiApiKeyComponent: React.FC<{
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
      store.updateModelSpecificSettings("gemini", {
        gemini_apiKey: v.target.value,
      });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Gemini API key</div>
        <div className="setting-item-description">
          Your Gemini API key. You can create one{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank">
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
          value={store.settings.gemini_apiKey}
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

const DEFAULT_GEMINI_MODELS: Model[] = [
  {
    label: "Gemini 2.5 Flash Preview Text-to-Speech",
    value: "gemini-2.5-flash-preview-tts",
    supportsInstructions: true
  },
  {
    label: "Gemini 2.5 Pro Preview Text-to-Speech",
    value: "gemini-2.5-pro-preview-tts",
    supportsInstructions: true
  },
] as const;

const GeminiModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Model</div>
        <div className="setting-item-description">
          The Gemini TTS model to use
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_GEMINI_MODELS}
          value={store.settings.gemini_ttsModel}
          onChange={(v) =>
            store.updateModelSpecificSettings("gemini", {
              gemini_ttsModel: v,
            })
          }
        />
      </div>
    </div>
  );
});

const GeminiVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  interface Voice {
    label: string;
    value: string;
    models: string[];
  }
  const DEFAULT_GEMINI_VOICES: Voice[] = [
    {
      label: "Zephyr -- Bright",
      value: "Zephyr",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Puck -- Upbeat",
      value: "Puck",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Charon -- Informative",
      value: "Charon",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Kore -- Firm",
      value: "Kore",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Fenrir -- Excitable",
      value: "Fenrir",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Leda -- Youthful",
      value: "Leda",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Orus -- Firm",
      value: "Orus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Aoede -- Breezy",
      value: "Aoede",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Callirhoe -- Easy-going",
      value: "Callirhoe",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Autonoe -- Bright",
      value: "Autonoe",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Enceladus -- Breathy",
      value: "Enceladus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Iapetus -- Clear",
      value: "Iapetus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Umbriel -- Easy-going",
      value: "Umbriel",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Algieba -- Smooth",
      value: "Algieba",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Despina -- Smooth",
      value: "Despina",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Erinome -- Clear",
      value: "Erinome",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
  ] as const;

  const voices = React.useMemo(() => {
    return DEFAULT_GEMINI_VOICES.filter((v) =>
      v.models.includes(store.settings.gemini_ttsModel),
    );
  }, [store.settings.gemini_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.gemini_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("gemini", {
      gemini_ttsVoice: voices[0].value,
    });
  }, [store.settings.gemini_ttsVoice, voices]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_GEMINI_VOICES}
          value={store.settings.gemini_ttsVoice}
          onChange={(v) =>
            store.updateModelSpecificSettings("gemini", {
              gemini_ttsVoice: v,
            })
          }
        />
      </div>
    </div>
  );
});

const GeminiTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("gemini", {
        gemini_ttsInstructions: evt.target.value,
      });
    }, []);

  const modelSupportsInstructions = React.useMemo(() => {
    const model = DEFAULT_GEMINI_MODELS.find(
      (x) => x.value === store.settings.gemini_ttsModel,
    );
    return model?.supportsInstructions || false;
  }, [store.settings.gemini_ttsModel]);

  const disabled = !modelSupportsInstructions;

  const instructions = modelSupportsInstructions
    ? store.settings.gemini_ttsInstructions
    : "";

  return (
    <div className="setting-item tts-settings-block">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Instructions</div>
        <div className="setting-item-description">
          Optional instructions to customize the tone and style of the voice
          (only supported by some models)
        </div>
      </div>
      <textarea
        value={instructions}
        disabled={disabled}
        onChange={onChange}
        placeholder="Example: Speak in a whisper"
        rows={3}
        className="tts-instructions-textarea"
      />
    </div>
  );
});

const GeminiContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> = React.useCallback(
    (evt) => {
      store.updateModelSpecificSettings("gemini", {
        gemini_contextMode: evt.target.checked,
      });
    },
    [store],
  );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Context Mode</div>
        <div className="setting-item-description">Enable context mode to improve coherence across sentences.</div>
      </div>
      <div className="setting-item-control">
        <input type="checkbox" checked={store.settings.gemini_contextMode} onChange={onChange} />
      </div>
    </div>
  );
});

const HumeApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      store.updateModelSpecificSettings("hume", {
        hume_apiKey: v.target.value,
      });
    }, []);
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Hume API key</div>
        <div className="setting-item-description">
          Your Hume API key. You can get one{" "}
          <a href="https://platform.hume.ai/settings/keys" target="_blank">
            here
          </a>
          .
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="API Key"
          value={store.settings.hume_apiKey}
          onChange={onChange}
        />
        <IconButton icon={showPassword ? "eye-off" : "eye"} onClick={() => setShowPassword(!showPassword)} />
      </div>
    </div>
  );
});

const HumeProviderComponent: React.FC<{ store: TTSPluginSettingsStore }> = observer(({ store }) => {
  const providerOptions = [
    { label: "Hume", value: "HUME_AI" },
    { label: "Custom Voice", value: "CUSTOM_VOICE" },
  ];
  const onChange = React.useCallback(
    (v: string) => {
      store.updateModelSpecificSettings("hume", {
        hume_sourceType: v,
      });
    },
    [store],
  );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Provider</div>
        <div className="setting-item-description">
          Choose between Hume's preset voices or your own custom voices.
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={providerOptions}
          value={store.settings.hume_sourceType}
          onChange={onChange}
        />
      </div>
    </div>
  );
});

const HumeVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Hume Voice ID</div>
        <div className="setting-item-description">The Hume Voice ID to use</div>
      </div>
      <input type="text"
        value={store.settings.hume_ttsVoice}
        onChange={
          (v) => store.updateModelSpecificSettings("hume", {
            hume_ttsVoice: v.target.value
          }
        )}
      />
    </div>);
});

const HumeTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("hume", {
        hume_ttsInstructions: evt.target.value,
      });
    }, []);

  const disabled = false;
  const instructions = store.settings.hume_ttsInstructions;

  return (
    <div className="setting-item tts-settings-block">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Instructions</div>
        <div className="setting-item-description">
          Optional instructions to customize the tone and style of the voice
        </div>
      </div>
      <textarea
        value={instructions}
        disabled={disabled}
        onChange={onChange}
        placeholder="Example: Speak in a whisper"
        rows={3}
        className="tts-instructions-textarea"
      />
    </div>
  );
});

const HumeContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> = React.useCallback(
    (evt) => {
      store.updateModelSpecificSettings("hume", {
        hume_contextMode: evt.target.checked,
      });
    },
    [store],
  );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Context Mode</div>
        <div className="setting-item-description">Enable context mode to improve coherence across sentences.</div>
      </div>
      <div className="setting-item-control">
        <input type="checkbox" checked={store.settings.hume_contextMode} onChange={onChange} />
      </div>
    </div>
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

const DEFAULT_OPENAI_MODELS: Model[] = [
  { label: "gpt-4o-mini-tts", value: "gpt-4o-mini-tts", supportsInstructions: true },
  { label: "tts-1", value: "tts-1" },
  { label: "tts-1-hd", value: "tts-1-hd" },
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
          options={DEFAULT_OPENAI_MODELS}
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
  interface Voice {
    label: string;
    value: string;
    models: string[];
  }
  const DEFAULT_OPENAI_VOICES: Voice[] = [
    {
      label: "Alloy",
      value: "alloy",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Ash",
      value: "ash",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Ballad",
      value: "ballad",
      models: ["gpt-4o-mini-tts"]
    },
    {
      label: "Coral",
      value: "coral",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Echo",
      value: "echo",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Fable",
      value: "fable",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Onyx",
      value: "onyx",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Nova",
      value: "nova",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Sage",
      value: "sage",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Shimmer",
      value: "shimmer",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Verse",
      value: "verse",
      models: ["gpt-4o-mini-tts"]
    },
  ] as const;

  const voices = React.useMemo(() => {
    return DEFAULT_OPENAI_VOICES.filter((v) =>
      v.models.includes(store.settings.openai_ttsModel),
    );
  }, [store.settings.openai_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.openai_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("openai", {
      openai_ttsVoice: voices[0].value,
    });
  }, [store.settings.openai_ttsVoice, voices]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_OPENAI_VOICES}
          value={store.settings.openai_ttsVoice}
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

const OpenAITTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("openai", {
        openai_ttsInstructions: evt.target.value,
      });
    }, []);

  const modelSupportsInstructions = React.useMemo(() => {
    const model = DEFAULT_OPENAI_MODELS.find(
      (x) => x.value === store.settings.openai_ttsModel,
    );
    return model?.supportsInstructions || false;
  }, [store.settings.openai_ttsModel]);

  const disabled = !modelSupportsInstructions;

  const instructions = modelSupportsInstructions
    ? store.settings.openai_ttsInstructions
    : "";

  return (
    <div className="setting-item tts-settings-block">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Instructions</div>
        <div className="setting-item-description">
          Optional instructions to customize the tone and style of the voice
          (only supported by some models)
        </div>
      </div>
      <textarea
        value={instructions}
        disabled={disabled}
        onChange={onChange}
        placeholder="Example: Speak in a whisper"
        rows={3}
        className="tts-instructions-textarea"
      />
    </div>
  );
});

const OpenAIContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> = React.useCallback(
    (evt) => {
      store.updateModelSpecificSettings("openai", {
        openai_contextMode: evt.target.checked,
      });
    },
    [store],
  );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Context Mode</div>
        <div className="setting-item-description">Enable context mode to improve coherence across sentences.</div>
      </div>
      <div className="setting-item-control">
        <input type="checkbox" checked={store.settings.openai_contextMode} onChange={onChange} />
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
      store.updateSettings({ openaicompat_apiKey: v.target.value });
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

const OpenAICompatibleAPIBaseURLComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {

  function isValidURL(url: string) {
    if (!url) {
      return true;
    }
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
  const [state, setState] = React.useState({
    raw: store.settings.API_URL,
    valid: isValidURL(store.settings.API_URL),
  });
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      const url = v.target.value;
      const valid = isValidURL(url);
      setState({
        raw: url,
        valid,
      });
      if (valid) {
        store.updateSettings({ API_URL: url });
      }
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
          placeholder={OPENAI_API_URL}
          value={state.raw}
          onChange={onChange}
          className={!state.valid ? "tts-error-input" : ""}
        />
        {!state.valid && state.raw && (
          <div className="setting-item-description tts-error-text">
            Please enter a valid URL (e.g. https://api.example.com)
          </div>
        )}
      </div>
    </div>
  );
});

const OpenAICompatibleVoiceComponent: React.FC<{
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