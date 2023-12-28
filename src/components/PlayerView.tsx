import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "src/obsidian/ObsidianBridge";
import { TTSPluginSettingsStore } from "src/player/TTSPluginSettings";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/Player";
import { AudioVisualizer } from "./AudioVisualizer";
import { IconButton, Spinner } from "./IconButton";

export const PlayerView = observer(({
  player,
  settings,
  sink,
  obsidian,
}: {
  player: AudioStore;
  settings: TTSPluginSettingsStore;
  sink: AudioSink;
  obsidian: ObsidianBridge;
}): React.ReactNode => {
  if (!player.activeText) {
    return <div style={{ display: "none", height: 0, overflow: "hidden" }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        padding: "0.15rem 0.5rem",
        alignItems: "stretch",
      }}
    >
      <IconButton
        icon="play"
        tooltip="Play Selection"
        style={{
          marginRight: "0.5rem",
        }}
        onClick={() => {
          obsidian.playSelection();
        }}
      />
      <IconButton
        icon="skip-back"
        tooltip="Previous"
        onClick={() =>
          player.activeText?.goToPosition(player.activeText?.position - 1 || 0)
        }
      />
      {player.activeText?.isPlaying ? (
        <IconButton
          key="pause"
          icon="pause"
          tooltip="Pause"
          onClick={() => player.activeText?.pause()}
        />
      ) : (
        <IconButton
          key="play"
          icon="step-forward"
          tooltip="Resume"
          onClick={() => player.activeText?.play()}
        />
      )}
      <IconButton
        icon="skip-forward"
        tooltip="Next"
        onClick={() =>
          player.activeText?.goToPosition(player.activeText?.position + 1 || 0)
        }
      />

      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <AudioStatusInfo
          audio={sink}
          player={player}
          settings={settings}
          obsidian={obsidian}
        />
      </div>
      <IconButton
        tooltip="Cancel Playback"
        icon="x"
        onClick={() => player.closePlayer()}
      />
    </div>
  );
});

const AudioStatusInfo: React.FC<{
  audio: AudioSink;
  player: AudioStore;
  settings: TTSPluginSettingsStore;
  obsidian: ObsidianBridge;
}> = observer(({ audio, player, settings, obsidian }) => {
  const spacer = "1rem";
  if (settings.apiKeyValid === false) {
    return (
      // Extra span container to absorb the align-items: stretch from the container
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span
          style={{
            marginLeft: `${spacer}`,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            backgroundColor: "rgba(var(--background-modifier-error-rgb), 0.5)",
            // color: "var(--text-error)",
            fontStyle: "italic",
            fontSize: "var(--font-ui-small)",
            padding: "0.15rem",
            borderRadius: "var(--radius-s)",
          }}
        >
          <a onClick={() => obsidian.openSettings()}>{settings.apiKeyError}</a>
        </span>
      </span>
    );
  } else if (player.activeText?.isLoading) {
    return (
      <Spinner
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginLeft: spacer,
        }}
      />
    );
  } else if (audio.source && audio.context && player.activeText?.isPlaying) {
    return (
      <AudioVisualizer
        style={{
          marginLeft: spacer,
        }}
        audio={audio.source}
        context={audio.context}
      />
    );
  } else {
    return null;
  }
});
