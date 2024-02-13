import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "src/obsidian/ObsidianBridge";
import { TTSPluginSettingsStore } from "src/player/TTSPluginSettings";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/Player";
import { AudioVisualizer } from "./AudioVisualizer";
import { IconButton, Spinner } from "./IconButton";
import { EditorView } from "@codemirror/view";

export const PlayerView = observer(
  ({
    editor,
    player,
    settings,
    sink,
    obsidian,
  }: {
    editor: EditorView;
    player: AudioStore;
    settings: TTSPluginSettingsStore;
    sink: AudioSink;
    obsidian: ObsidianBridge;
  }): React.ReactNode => {
    const isActive = !!player.activeText && editor === obsidian.activeEditor;
    if (!isActive) {
      return null;
    }
    return (
      <div className="tts-toolbar-player">
        <div className="tts-toolbar-player-button-group">
          <IconButton
            icon="play"
            tooltip="Play selection"
            onClick={() => {
              obsidian.playSelection();
            }}
          />
        </div>
        <div className="tts-toolbar-player-button-group">
          <IconButton
            icon="skip-back"
            tooltip="Previous"
            onClick={() =>
              player.activeText?.goToPosition(
                player.activeText?.position - 1 || 0,
              )
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
              player.activeText?.goToPosition(
                player.activeText?.position + 1 || 0,
              )
            }
          />
        </div>
        <div className="tts-audio-status-container">
          <AudioStatusInfoContents
            audio={sink}
            player={player}
            settings={settings}
            obsidian={obsidian}
          />
        </div>
        <div className="tts-toolbar-player-button-group">
          <IconButton
            tooltip="Cancel playback"
            icon="x"
            onClick={() => player.closePlayer()}
          />
        </div>
      </div>
    );
  },
);

const AudioStatusInfoContents: React.FC<{
  audio: AudioSink;
  player: AudioStore;
  settings: TTSPluginSettingsStore;
  obsidian: ObsidianBridge;
}> = observer(({ audio, player, settings, obsidian }) => {
  if (settings.apiKeyValid === false) {
    return (
      // Extra span container to absorb the align-items: stretch from the container
      <span className="tts-audio-status-error">
        <span className="tts-audio-status-error-text">
          <a onClick={() => obsidian.openSettings()}>{settings.apiKeyError}</a>
        </span>
      </span>
    );
  } else if (player.activeText?.isLoading) {
    return <Spinner className="tts-audio-status-loading" />;
  } else if (audio.source && audio.context && player.activeText?.isPlaying) {
    return <AudioVisualizer audio={audio.source} context={audio.context} />;
  } else {
    return null;
  }
});
