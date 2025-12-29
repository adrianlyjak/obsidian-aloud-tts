import { observer } from "mobx-react-lite";
import * as React from "react";
import { setIcon } from "obsidian";
import { TTSActions } from "../player/TTSActions";
import { AudioStore } from "../player/AudioStore";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";

export interface TTSControlMenuProps {
  actions: TTSActions;
  player: AudioStore;
  settings: TTSPluginSettingsStore;
  onClose: () => void;
}

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.5;
const SPEED_STEP = 0.1;

/**
 * Custom TTS control menu content component.
 * Renders the inner content of the menu (without the outer .menu wrapper).
 * The container element should have class="menu" applied.
 */
export const TTSControlMenuContent = observer(
  ({
    actions,
    player,
    settings,
    onClose,
  }: TTSControlMenuProps): React.ReactElement => {
    const active = player.activeText;
    const isPlaying = active?.isPlaying ?? false;
    const speed = settings.settings.playbackSpeed;

    // Close on Escape
    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleSpeedChange = (
      e: React.ChangeEvent<HTMLInputElement>,
    ): void => {
      const newSpeed = parseFloat(e.target.value);
      settings.setSpeed(newSpeed);
    };

    return (
      <>
        {/* Grabber for mobile drawer UI */}
        <div className="menu-grabber" />
        <div className="menu-scroll">
          {/* Playback controls group */}
          <div className="menu-group tts-menu-playback-group">
            <div className="tts-menu-row tts-menu-playback">
              <IconButton
                icon="skip-back"
                label="Previous"
                onClick={() => actions.previous()}
                disabled={!active}
              />
              <IconButton
                icon={isPlaying ? "pause" : "play"}
                label={isPlaying ? "Pause" : "Play"}
                onClick={() => actions.playPause()}
                primary
              />
              <IconButton
                icon="skip-forward"
                label="Next"
                onClick={() => actions.next()}
                disabled={!active}
              />
              <IconButton
                icon="square"
                label="Stop"
                onClick={() => {
                  actions.stop();
                  onClose();
                }}
                disabled={!active}
              />
            </div>
          </div>

          <div className="menu-separator" />

          {/* Settings group: restart from cursor */}
          <div className="menu-group">
            <div
              className="menu-item tappable"
              onClick={() => {
                actions.stop();
                actions.playSelection();
                onClose();
              }}
            >
              <div className="menu-item-icon">
                <ObsidianIcon icon="play" />
              </div>
              <div className="menu-item-title">Restart playing from cursor</div>
            </div>
          </div>

          <div className="menu-separator" />

          {/* Settings group: speed, auto scroll */}
          <div className="menu-group">
            {/* Speed slider */}
            <div className="menu-item tts-menu-speed">
              <div className="menu-item-icon">
                <ObsidianIcon icon="gauge" />
              </div>
              <input
                type="range"
                className="tts-menu-slider"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={SPEED_STEP}
                value={speed}
                onChange={handleSpeedChange}
              />
              <span className="tts-menu-speed-value">{speed.toFixed(1)}x</span>
            </div>

            {/* Auto scroll toggle */}
            <div
              className="menu-item tappable"
              onClick={() => actions.toggleAutoscroll()}
            >
              <div className="menu-item-icon">
                <ObsidianIcon
                  icon={actions.autoscrollEnabled() ? "eye" : "eye-off"}
                />
              </div>
              <div className="menu-item-title">
                Auto scroll: {actions.autoscrollEnabled() ? "ON" : "OFF"}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  },
);

interface IconButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  primary = false,
}) => {
  return (
    <button
      className={`tts-menu-icon-btn ${primary ? "tts-menu-icon-btn-primary" : ""} ${disabled ? "is-disabled" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <ObsidianIcon icon={icon} />
    </button>
  );
};

const ObsidianIcon: React.FC<{ icon: string }> = ({ icon }) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, icon);
    }
  }, [icon]);
  return <span ref={ref} className="svg-icon" />;
};
