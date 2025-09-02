import { observer } from "mobx-react-lite";
import * as React from "react";
import { AudioStore } from "../player/AudioStore";
import {
  MARKETING_NAME,
  ModelProvider,
  PlayerViewMode,
  TTSPluginSettingsStore,
  isPlayerViewMode,
  modelProviders,
  playViewModes,
} from "../player/TTSPluginSettings";
import { IconButton, Spinner } from "./IconButton";
import { Play, Pause } from "lucide-react";
import { TTSErrorInfoDetails, TTSErrorInfoView } from "./PlayerView";
import { OptionSelect } from "./settings/option-select";
import { AzureSettings } from "./settings/providers/provider-azure";
import { ElevenLabsSettings } from "./settings/providers/provider-elevenlabs";
import { GeminiSettings } from "./settings/providers/provider-gemini";
import { HumeSettings } from "./settings/providers/provider-hume";
import { OpenAISettings } from "./settings/providers/provider-openai";
import { OpenAICompatibleSettings } from "./settings/providers/provider-openai-like";

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
      <div
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ display: "inline-block" }}>Model Provider</h1>
        <div style={{ display: "inline-block" }}>
          <ModelSwitcher store={store} />
        </div>
      </div>

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
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Autoscroll Player View</div>
          <div className="setting-item-description">
            Automatically scroll the player view to keep the active text
            visible.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={store.settings.autoScrollPlayerView}
            onChange={(e) =>
              store.updateSettings({ autoScrollPlayerView: e.target.checked })
            }
          />
        </div>
      </div>
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
  openai: "OpenAI",
  openaicompat: "OpenAI Compatible (Advanced)",
  azure: "Azure Speech Services",
  elevenlabs: "ElevenLabs",
  gemini: "Google Gemini",
  hume: "Hume",
};

const ModelSwitcher: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelect
      options={modelProviders.map((v) => ({ label: labels[v], value: v }))}
      value={store.settings.modelProvider}
      onChange={(v) =>
        store.updateModelSpecificSettings(v as ModelProvider, {})
      }
    />
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

  const [testText, setTestText] = React.useState(
    "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon. There is , according to legend, a boiling pot of gold at one end. People look, but no one ever finds it.",
  );

  const playSample = React.useCallback(() => {
    if (!isPlaying) {
      const text = testText;
      if (!text.trim()) {
        return;
      }
      const filename = "sample";
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
  }, [testText, isPlaying, isActive, player, setActive]);

  const onTextChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((e) => {
      setTestText(e.target.value);
    }, []);

  const canPlay = !!testText.trim();

  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Test Voice</div>
          <div className="setting-item-description">
            Test the voice with a custom phrase to see how it sounds.
          </div>
        </div>
        <div className="setting-item-control">
          <button
            onClick={playSample}
            disabled={!canPlay && !isPlaying}
            className="mod-cta"
          >
            {isLoading ? (
              <Spinner style={{ marginRight: "0.5em" }} delay={250} />
            ) : (
              <span style={{ marginRight: "0.5em" }}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </span>
            )}{" "}
            Test Voice
          </button>
        </div>
      </div>
      <div>
        <textarea
          rows={3}
          value={testText}
          onChange={onTextChange}
          style={{ width: "100%", marginBottom: "0.5em" }}
          placeholder="Enter text to test..."
        />
      </div>
    </>
  );
});
