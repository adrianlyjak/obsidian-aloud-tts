import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { OptionSelectSetting } from "../setting-components";
import {
  KOKORO_DEFAULT_VOICES,
  getKokoroInstance,
  isKokoroModelLoaded,
  isKokoroModelLoading,
  ProgressInfo,
} from "../../../models/kokoro";

interface DownloadProgress {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export const KokoroSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    const modelStatus = store.settings.kokoro_modelStatus;

    return (
      <>
        <KokoroModelDownload store={store} />
        {modelStatus === "ready" && <KokoroVoiceComponent store={store} />}
      </>
    );
  },
);

const KokoroModelDownload: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [downloadProgress, setDownloadProgress] =
    React.useState<DownloadProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const modelStatus = store.settings.kokoro_modelStatus;

  // Check if model is already loaded on mount
  React.useEffect(() => {
    if (isKokoroModelLoaded() && modelStatus !== "ready") {
      store.updateModelSpecificSettings("kokoro", {
        kokoro_modelStatus: "ready",
      });
    }
  }, []);

  const handleDownload = React.useCallback(async () => {
    setError(null);
    setDownloadProgress({ status: "Initializing..." });

    try {
      await store.updateModelSpecificSettings("kokoro", {
        kokoro_modelStatus: "downloading",
      });

      await getKokoroInstance((progress: ProgressInfo) => {
        setDownloadProgress({
          status: progress.status,
          file: progress.file || progress.name,
          progress: progress.progress,
          loaded: progress.loaded,
          total: progress.total,
        });
      });

      await store.updateModelSpecificSettings("kokoro", {
        kokoro_modelStatus: "ready",
      });
      setDownloadProgress(null);
    } catch (err) {
      console.error("Failed to download Kokoro model:", err);
      const message =
        err instanceof Error ? err.message : "Failed to download model";

      setError(message);

      await store.updateModelSpecificSettings("kokoro", {
        kokoro_modelStatus: "not_downloaded",
      });
      setDownloadProgress(null);
    }
  }, [store]);

  const isDownloading = modelStatus === "downloading" || isKokoroModelLoading();

  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Kokoro TTS Model</div>
          <div className="setting-item-description">
            Kokoro is a local TTS model that runs entirely on your device. No
            API key required!
            <br />
            <br />
            <strong>Download size:</strong> ~90 MB (cached after first download)
          </div>
        </div>
        <div className="setting-item-control">
          {modelStatus === "ready" && !isDownloading ? (
            <span
              style={{
                color: "var(--text-success)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              ✓ Ready
            </span>
          ) : (
            <button
              className="mod-cta"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? "Downloading..." : "Download Model"}
            </button>
          )}
        </div>
      </div>

      {isDownloading && downloadProgress && (
        <div className="setting-item">
          <div style={{ width: "100%" }}>
            <ProgressBar progress={downloadProgress} />
          </div>
        </div>
      )}

      {error && (
        <div
          className="setting-item"
          style={{
            backgroundColor: "var(--background-modifier-error)",
            padding: "0.75rem",
            borderRadius: "4px",
          }}
        >
          <div className="setting-item-info">
            <div
              className="setting-item-description"
              style={{ color: "white" }}
            >
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

const ProgressBar: React.FC<{ progress: DownloadProgress }> = ({
  progress,
}) => {
  const percent =
    progress.progress != null
      ? Math.round(progress.progress)
      : progress.loaded && progress.total
        ? Math.round((progress.loaded / progress.total) * 100)
        : null;

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div style={{ padding: "0.5rem 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: "0.85em",
          color: "var(--text-muted)",
        }}
      >
        <span>
          {progress.status}
          {progress.file ? `: ${progress.file}` : ""}
        </span>
        <span>
          {percent != null
            ? `${percent}%`
            : progress.loaded
              ? formatBytes(progress.loaded)
              : ""}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: "var(--background-modifier-border)",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: percent != null ? `${percent}%` : "100%",
            height: "100%",
            backgroundColor: "var(--interactive-accent)",
            borderRadius: "4px",
            transition: "width 0.3s ease",
            animation: percent == null ? "pulse 1.5s infinite" : undefined,
          }}
        />
      </div>
      {progress.loaded && progress.total && (
        <div
          style={{
            marginTop: "0.25rem",
            fontSize: "0.8em",
            color: "var(--text-muted)",
          }}
        >
          {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
        </div>
      )}
    </div>
  );
};

const KokoroVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Voice"
      description={
        <>
          The voice to use for speech synthesis.
          <br />
          <small style={{ color: "var(--text-muted)" }}>
            af/am = American female/male, bf/bm = British female/male
          </small>
        </>
      }
      store={store}
      provider="kokoro"
      fieldName="kokoro_voice"
      options={KOKORO_DEFAULT_VOICES}
    />
  );
});
