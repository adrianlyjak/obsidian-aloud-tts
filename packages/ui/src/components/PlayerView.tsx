import { observer } from "mobx-react-lite";
import * as React from "react";
import { MARKETING_NAME, TTSPluginSettingsStore } from "open-tts";
import { AudioSink } from "open-tts";
import { AudioStore } from "open-tts";
import { createTTSActions } from "open-tts";
import { AudioVisualizer } from "./AudioVisualizer";
import { IconButton, Spinner } from "./IconButton";
import { TTSErrorInfo } from "open-tts";
import { useTooltip } from "../util/TooltipContext";
import { AlertCircle } from "lucide-react";

export const PlayerView = observer(
  ({
    player,
    settings,
    sink,
    shouldShow,
    isMobilePhone,
    audioElement,
    onOpenSettings,
    onPlaySelection,
  }: {
    player: AudioStore;
    settings: TTSPluginSettingsStore;
    sink: AudioSink;
    shouldShow: boolean;
    isMobilePhone: boolean;
    audioElement?: HTMLAudioElement;
    onOpenSettings: () => void;
    onPlaySelection: () => void;
  }): React.ReactNode => {
    if (isMobilePhone) {
      return null;
    }

    const actions = React.useMemo(
      () =>
        createTTSActions(player, settings, {
          playSelection: onPlaySelection,
        }),
      [player, settings, onPlaySelection],
    );

    if (!shouldShow) {
      return null;
    }
    return (
      <div className="tts-toolbar-player">
        <div className="tts-toolbar-player-button-group">
          <IconButton
            icon="play"
            tooltip="Play selection"
            onClick={() => actions.playSelection()}
          />
        </div>
        <div className="tts-toolbar-player-button-group">
          <IconButton
            icon="skip-back"
            tooltip="Previous"
            onClick={() => actions.previous()}
            disabled={!player.activeText}
          />

          {sink.trackStatus === "playing" ? (
            <IconButton
              key="pause"
              icon="pause"
              tooltip="Pause"
              onClick={() => actions.playPause()}
            />
          ) : (
            <IconButton
              key="play"
              icon="step-forward"
              tooltip="Resume"
              onClick={() => actions.playPause()}
              disabled={!player.activeText}
            />
          )}
          <IconButton
            icon="skip-forward"
            tooltip="Next"
            onClick={() => actions.next()}
            disabled={!player.activeText}
          />
          <IconButton
            icon={player.autoScrollEnabled ? "eye" : "eye-off"}
            tooltip={
              player.autoScrollEnabled
                ? "Autoscroll enabled (click to disable)"
                : "Autoscroll disabled (click to enable and scroll to current position)"
            }
            onClick={() => actions.toggleAutoscroll()}
            highlight={player.autoScrollEnabled}
          />
          <EditPlaybackSpeedButton settings={settings} />
        </div>
        <div className="tts-audio-status-container">
          <AudioStatusInfoContents
            audioElement={audioElement}
            player={player}
            settings={settings}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <div className="tts-toolbar-player-button-group">
          {player.activeText && (
            <IconButton
              tooltip="Cancel playback"
              icon="x"
              onClick={() => actions.stop()}
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
  audioElement?: HTMLAudioElement;
  player: AudioStore;
  settings: TTSPluginSettingsStore;
  onOpenSettings: () => void;
}> = observer(({ audioElement, player, settings, onOpenSettings }) => {
  if (settings.apiKeyValid === false) {
    return (
      // Extra span container to absorb the align-items: stretch from the container
      <span className="tts-audio-status-error">
        <AlertCircle className="tts-audio-status-error-icon" size={16} />{" "}
        <span className="tts-audio-status-error-text">
          <a onClick={onOpenSettings}>{settings.apiKeyError}</a>
        </span>
      </span>
    );
  } else if (player.activeText?.error) {
    return <TTSErrorInfoView error={player.activeText.error} />;
  } else if (player.activeText?.isLoading) {
    return <Spinner className="tts-audio-status-loading" delay={500} />;
  } else if (
    audioElement &&
    player.activeText?.isPlaying &&
    player.activeText.currentChunk?.decodedAudio &&
    player.activeText.currentChunk.timelineStartSeconds != null
  ) {
    return (
      <AudioVisualizer
        audioElement={audioElement}
        decodedAudio={player.activeText.currentChunk?.decodedAudio}
        timelineStartSeconds={
          player.activeText.currentChunk?.timelineStartSeconds
        }
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
  const tooltipService = useTooltip();

  React.useEffect(() => {
    if (ref.current) {
      tooltipService.setTooltip(ref.current, tooltip);
    }
  }, [ref.current, tooltip, tooltipService]);

  return (
    <span className="tts-audio-status-error">
      <AlertCircle className="tts-audio-status-error-icon" size={16} />{" "}
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
