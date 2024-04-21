import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "src/obsidian/ObsidianBridge";
import { TTSPluginSettingsStore } from "src/player/TTSPluginSettings";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/Player";
import { AudioVisualizer } from "./AudioVisualizer";
import { IconButton, IconSpan, Spinner } from "./IconButton";
import { EditorView } from "@codemirror/view";
import { TTSErrorInfo } from "src/player/TTSModel";
import { setTooltip } from "obsidian";

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
            onClick={() => player.activeText?.goToPrevious()}
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
            onClick={() => player.activeText?.goToNext()}
          />
          <div
            className={"clickable-icon tts-toolbar-button"}
            style={{ fontSize: "var(--font-ui-smaller)" }}
            onClick={settings.changeSpeed}
          >
            {settings.settings.playbackSpeed}x
          </div>
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
        <IconSpan
          className="tts-audio-status-error-icon"
          icon="alert-circle"
        ></IconSpan>{" "}
        <span className="tts-audio-status-error-text">
          <a onClick={() => obsidian.openSettings()}>{settings.apiKeyError}</a>
        </span>
      </span>
    );
  } else if (player.activeText?.error) {
    return <TTSErrorInfoView error={player.activeText.error} />;
  } else if (player.activeText?.isLoading) {
    return <Spinner className="tts-audio-status-loading" />;
  } else if (audio.source && audio.context && player.activeText?.isPlaying) {
    return <AudioVisualizer audio={audio.source} context={audio.context} />;
  } else {
    return null;
  }
});

function TTSErrorInfoView(props: { error: TTSErrorInfo }): React.ReactNode {
  let moreInfo = "";
  if (props.error.httpErrorCode === 401) {
    moreInfo = "Please check your API key.";
  } else if (props.error.httpErrorCode === 429) {
    moreInfo =
      "Make sure your API token has enough credits or you are not exceeding rate limits.";
  }
  const textBody = `${props.error.errorDetails}`
    ? JSON.stringify(props.error.errorDetails, null, 2)
    : undefined;

  const tooltip = [props.error.message, moreInfo, textBody]
    .filter((x) => x)
    .join("\n");
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (ref.current) {
      setTooltip(ref.current, tooltip);
    }
  }, [ref.current, tooltip]);

  return (
    <span className="tts-audio-status-error">
      <IconSpan
        className="tts-audio-status-error-icon"
        icon="alert-circle"
      ></IconSpan>{" "}
      <span
        className="tts-audio-status-error-text"
        ref={(x) => (ref.current = x)}
      >
        {props.error.message}
      </span>
    </span>
  );
}
