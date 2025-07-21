import { observer } from "mobx-react-lite";
import * as React from "react";
import { AudioStore } from "../player/AudioStore";
import {
  ModelProvider,
  PlayerViewMode,
  MARKETING_NAME,
  TTSPluginSettingsStore,
  isPlayerViewMode,
  modelProviders,
  playViewModes,
} from "../player/TTSPluginSettings";
import { IconButton, IconSpan, Spinner } from "./IconButton";
import { TTSErrorInfoDetails, TTSErrorInfoView } from "./PlayerView";
import { hasNamedVoice, REGISTRY } from "../models/registry";
import { GeminiSettings } from "./settings/providers/provider-gemini";
import { HumeSettings } from "./settings/providers/provider-hume";
import { OpenAISettings } from "./settings/providers/provider-openai";
import { OpenAICompatibleSettings } from "./settings/providers/provider-openai-like";
import { ElevenLabsSettings } from "./settings/providers/provider-elevenlabs";
import { AzureSettings } from "./settings/providers/provider-azure";
import { OptionSelect } from "./settings/option-select";

export const TTSSettingsTabComponent: React.FC<{
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
        <GeminiSettings store={store} />
      )}
      {store.settings.modelProvider === "hume" && (
        <HumeSettings store={store} />
      )}
      {store.settings.modelProvider === "openai" && (
        <OpenAISettings store={store} />
      )}
      {store.settings.modelProvider === "openaicompat" && (
        <OpenAICompatibleSettings store={store} />
      )}
      {store.settings.modelProvider === "elevenlabs" && (
        <ElevenLabsSettings store={store} />
      )}
      {store.settings.modelProvider === "azure" && (
        <AzureSettings store={store} />
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
  elevenlabs: "ElevenLabs",
  azure: "Azure Speech Services",
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
            store.updateModelSpecificSettings(v as ModelProvider, {})
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

const TestVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
  player: AudioStore;
  isActive: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
}> = observer(({ store, player, isActive, setActive }) => {
  const isPlaying = player.activeText?.isPlaying && isActive;
  const isLoading = player.activeText?.isLoading;
  const opts = REGISTRY[store.settings.modelProvider].convertToOptions(
    store.settings,
  );
  const playSample = React.useCallback(() => {
    if (!isPlaying) {
      let text;
      let filename;

      if (!opts.voice || !hasNamedVoice(store.settings.modelProvider)) {
        text = `Hi, I'm a virtual text to speech assistant.`;
        filename = "sample";
      } else {
        text = `Hi, I'm ${opts.voice}. I'm a virtual text to speech assistant.`;
        filename = "sample " + opts.voice;
      }
      player.startPlayer({
        text,
        filename,
        start: 0,
        end: text.length,
      });
      if (!isActive) {
        setActive(true);
      }
    } else {
      player.activeText?.pause();
    }
  }, [opts.voice, isPlaying, store.settings.modelProvider]);
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
