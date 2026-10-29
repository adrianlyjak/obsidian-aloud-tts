import { observer } from "mobx-react-lite";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import {
  AudioSink,
  AudioStore,
  createTTSActions,
  TTSPluginSettingsStore,
} from "open-tts";
import { AudioStatusInfoContents } from "@open-tts/ui";
import { ObsidianBridge } from "../ObsidianBridge";
import { ObsidianTooltipProvider } from "../util/ObsidianTooltipService";
import { setIcon } from "obsidian";
import { TTSControlMenuContent } from "./TTSControlMenu";

type SinkWithElement = AudioSink & { audioElement?: HTMLAudioElement };

export class DetachedPlayerHost {
  private root: Root;

  constructor(
    private container: HTMLElement,
    player: AudioStore,
    settings: TTSPluginSettingsStore,
    sink: AudioSink,
    bridge: ObsidianBridge,
  ) {
    this.container.classList.add("tts-detached-player-host");
    this.root = createRoot(this.container);
    this.root.render(
      <ObsidianTooltipProvider>
        <DetachedPlayerView
          player={player}
          settings={settings}
          sink={sink}
          bridge={bridge}
          audioElement={(sink as SinkWithElement).audioElement}
          statusBarItem={this.container}
        />
      </ObsidianTooltipProvider>,
    );
  }

  destroy(): void {
    this.root.unmount();
    this.container.remove();
  }
}

export const DetachedPlayerView = observer(
  ({
    player,
    settings,
    bridge,
    audioElement,
    statusBarItem,
  }: {
    player: AudioStore;
    settings: TTSPluginSettingsStore;
    sink: AudioSink;
    bridge: ObsidianBridge;
    audioElement?: HTMLAudioElement;
    statusBarItem?: HTMLElement;
  }): React.ReactNode => {
    const active = player.activeText;
    const hasDetachedPlayback = bridge.detachedAudio && !!active;
    const shouldShow = hasDetachedPlayback || bridge.canPlayDetachedAudio;
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const actions = React.useMemo(
      () => createTTSActions(player, settings, bridge),
      [player, settings, bridge],
    );

    React.useEffect(() => {
      if (!shouldShow) {
        setIsMenuOpen(false);
      }
    }, [shouldShow]);

    // The whole status bar item is the click target, waveform included, so it
    // takes the theme's hover style for clickable status bar items
    React.useEffect(() => {
      if (!statusBarItem || !shouldShow) {
        return;
      }
      const forwardClick = (event: MouseEvent): void => {
        const target = event.target as HTMLElement;
        if (!target.closest("button, a, .tts-detached-player-menu")) {
          buttonRef.current?.click();
        }
      };
      statusBarItem.classList.add("mod-clickable");
      statusBarItem.addEventListener("click", forwardClick);
      return () => {
        statusBarItem.classList.remove("mod-clickable");
        statusBarItem.removeEventListener("click", forwardClick);
      };
    }, [statusBarItem, shouldShow]);

    React.useEffect(() => {
      if (!isMenuOpen) {
        return;
      }

      const handleMouseDown = (event: MouseEvent): void => {
        if (
          buttonRef.current &&
          !buttonRef.current.parentElement?.contains(event.target as Node)
        ) {
          setIsMenuOpen(false);
        }
      };

      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [isMenuOpen]);

    if (!shouldShow) {
      return null;
    }

    const title = active?.audio.filename || active?.audio.friendlyName;

    const handleClick = (): void => {
      if (hasDetachedPlayback) {
        setIsMenuOpen(true);
        return;
      }
      bridge.playSelection();
    };

    return (
      <>
        <div className="tts-detached-status-content">
          <button
            ref={buttonRef}
            type="button"
            className="tts-detached-status-button"
            aria-label={
              hasDetachedPlayback ? "Open playback controls" : "Play PDF audio"
            }
            aria-expanded={isMenuOpen}
            aria-haspopup={hasDetachedPlayback ? "menu" : undefined}
            onClick={handleClick}
          >
            <ObsidianIcon
              icon={hasDetachedPlayback ? "audio-lines" : "file-text"}
            />
            {hasDetachedPlayback ? (
              <span className="tts-detached-status-title" title={title}>
                {title}
              </span>
            ) : (
              <span>Aloud PDF</span>
            )}
          </button>
          {hasDetachedPlayback && (
            <span className="tts-detached-status-info">
              <AudioStatusInfoContents
                audioElement={audioElement}
                player={player}
                settings={settings}
                onOpenSettings={() => bridge.openSettings()}
              />
            </span>
          )}
        </div>
        {isMenuOpen && hasDetachedPlayback && (
          <div
            className="menu tts-detached-player-menu"
            onClick={(event) => event.stopPropagation()}
          >
            <TTSControlMenuContent
              actions={actions}
              player={player}
              settings={settings}
              onClose={() => setIsMenuOpen(false)}
              showRestartFromCursor={false}
              showAutoscroll={false}
            />
          </div>
        )}
      </>
    );
  },
);

const ObsidianIcon: React.FC<{ icon: string }> = ({ icon }) => {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, icon);
    }
  }, [icon]);

  return <span ref={ref} className="svg-icon" aria-hidden="true" />;
};
