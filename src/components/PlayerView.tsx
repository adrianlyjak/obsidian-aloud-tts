import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import {
  MARKETING_NAME,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/AudioStore";
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
    const isActiveEditor =
      editor === obsidian.activeEditor || obsidian.detachedAudio;
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

          {sink.trackStatus === "playing" ? (
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
          <EditPlaybackSpeedButton settings={settings} />
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

const EditPlaybackSpeedButton: React.FC<{
  settings: TTSPluginSettingsStore;
}> = observer(({ settings }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // close the popover after 15 seconds of inactivity
  React.useEffect(() => {
    if (isOpen) {
      const timeout = setTimeout(() => {
        setIsOpen(false);
      }, 8000);
      return () => clearTimeout(timeout);
    }
    // reset the timeout when the playback speed changes
  }, [isOpen, settings.settings.playbackSpeed]);

  // Add event listener to close popover when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <div
        className={"clickable-icon tts-toolbar-button"}
        style={{
          fontSize: "var(--font-ui-smaller)",
          minWidth: "3rem",
          backgroundColor: isOpen ? "var(--background-secondary)" : undefined,
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {settings.settings.playbackSpeed}x
      </div>
      <div className="popover-container" style={{ position: "relative" }}>
        {isOpen && (
          <div
            className="popover"
            style={{
              top: "-1.5rem",
              right: "3rem",
              minHeight: "2rem",
              padding: "0.25rem",
              margin: "0.5rem",
              backgroundColor: "var(--background-primary)",
              justifyContent: "center",
              alignItems: "center",
            }}
            ref={popoverRef}
          >
            {/* <div style={{ margin: "0.5rem" }}> */}
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={settings.settings.playbackSpeed}
              onChange={(e) => settings.setSpeed(parseFloat(e.target.value))}
            />
            {/* </div> */}
          </div>
        )}
      </div>
    </>
  );
});

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
    return <Spinner className="tts-audio-status-loading" delay={500} />;
  } else if (
    audio.audio &&
    player.activeText?.isPlaying &&
    player.activeText.currentChunk?.audioBuffer &&
    player.activeText.currentChunk.offsetDuration !== undefined
  ) {
    return (
      <AudioVisualizer
        audioElement={audio.audio}
        audioBuffer={player.activeText.currentChunk?.audioBuffer}
        offsetDurationSeconds={player.activeText.currentChunk?.offsetDuration}
      />
    );
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
