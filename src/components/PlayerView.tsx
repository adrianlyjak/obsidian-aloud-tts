import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import {
  MARKETING_NAME,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/Player";
import { AudioVisualizer } from "./AudioVisualizer";
import { IconButton, IconSpan, Spinner } from "./IconButton";
import { EditorView } from "@codemirror/view";
import { TTSErrorInfo } from "../player/TTSModel";
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
    const hasText = !!player.activeText;
    const isActiveEditor = editor === obsidian.activeEditor;
    const isFocusedEditor = obsidian.focusedEditor === editor;
    let shouldShow: boolean;
    switch (settings.settings.showPlayerView) {
      case "always":
        shouldShow = isFocusedEditor || isActiveEditor;
        break;
      case "never":
        shouldShow = false;
        break;
      case "always-mobile":
        shouldShow = obsidian.isMobile()
          ? isFocusedEditor || isActiveEditor // same as "always"
          : isActiveEditor && hasText; // same as "playing"
        break;
      case "playing":
        shouldShow = isActiveEditor && hasText;
        break;
    }
    if (!shouldShow) {
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
            disabled={!player.activeText}
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
              disabled={!player.activeText}
            />
          )}
          <IconButton
            icon="skip-forward"
            tooltip="Next"
            onClick={() => player.activeText?.goToNext()}
            disabled={!player.activeText}
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
          {player.activeText && (
            <IconButton
              tooltip="Cancel playback"
              icon="x"
              onClick={() => player.closePlayer()}
            />
          )}
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
  } else if (audio.audio && player.activeText?.isPlaying) {
    return <AudioVisualizer audioElement={audio.audio} />;
  } else {
    return null;
  }
});

export function TTSErrorInfoView(props: {
  error: TTSErrorInfo;
}): React.ReactNode {
  const moreInfo = getMoreInfo(props.error);

  const tooltip = [
    props.error.message,
    moreInfo,
    `Go to the ${MARKETING_NAME} settings to see more details.`,
  ]
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

function getMoreInfo(error: TTSErrorInfo): string {
  if (error.httpErrorCode === 401) {
    return "Please check your API key.";
  } else if (error.httpErrorCode === 429) {
    return "Make sure your API token has enough credits or you are not exceeding rate limits.";
  }
  return "";
}

function getJSONErrorDetails(error: TTSErrorInfo): string | undefined {
  return error.errorDetails
    ? JSON.stringify(error.errorDetails, null, 2)
    : undefined;
}

export function TTSErrorInfoDetails(props: {
  error: TTSErrorInfo;
}): React.ReactNode {
  const moreInfo = getMoreInfo(props.error);
  const errorResponse = getJSONErrorDetails(props.error);
  return (
    <div className="tts-error-details">
      {moreInfo && (
        <div>
          <strong>More Info:</strong> {moreInfo}
        </div>
      )}
      {errorResponse && (
        <>
          <div>
            <strong>Error Response:</strong>
          </div>
          <div style={{ overflow: "auto" }}>
            <pre>
              <code>{getJSONErrorDetails(props.error)}</code>
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
