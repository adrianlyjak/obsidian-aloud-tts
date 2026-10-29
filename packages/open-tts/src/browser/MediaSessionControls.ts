import * as mobx from "mobx";
import { AudioStore } from "../player/AudioStore";
import { TTSActions } from "../player/TTSActions";

const ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "nexttrack",
  "previoustrack",
];

/**
 * Routes media keys and the system media controls through Aloud's playback
 * actions. They control the loaded text, like the player's own buttons, and
 * never follow focus: media keys work while the app is in the background, and
 * the system controls show the loaded file's name.
 */
export class MediaSessionControls {
  private disposeSync: mobx.IReactionDisposer;
  private hasHandlers = false;

  constructor(
    private session: MediaSession,
    private player: AudioStore,
    private actions: TTSActions,
  ) {
    this.disposeSync = mobx.autorun(() => {
      const text = this.player.activeText;
      // with nothing loaded, other audio in the app keeps the media keys
      this.setHandlers(!!text);
      const filename = text?.audio.filename;
      this.session.metadata = filename
        ? new MediaMetadata({ title: displayTitle(filename), artist: "Aloud" })
        : null;
      this.session.playbackState = !text
        ? "none"
        : text.isPlaying
          ? "playing"
          : "paused";
    });
  }

  destroy(): void {
    this.disposeSync();
    this.setHandlers(false);
    this.session.metadata = null;
    this.session.playbackState = "none";
  }

  private setHandlers(enabled: boolean): void {
    if (enabled === this.hasHandlers) {
      return;
    }
    this.hasHandlers = enabled;
    for (const action of ACTIONS) {
      this.session.setActionHandler(
        action,
        enabled ? () => this.handle(action) : null,
      );
    }
  }

  private handle(action: MediaSessionAction): void {
    switch (action) {
      case "play":
        if (!this.actions.isPlaying()) {
          this.actions.playPause();
        }
        break;
      case "pause":
        if (this.actions.isPlaying()) {
          this.actions.playPause();
        }
        break;
      case "stop":
        this.actions.stop();
        break;
      case "nexttrack":
        this.actions.next();
        break;
      case "previoustrack":
        this.actions.previous();
        break;
    }
  }
}

/** "Reading/Alias Tests.md" shows as "Alias Tests". */
function displayTitle(filename: string): string {
  const name = filename.split("/").pop() || filename;
  return name.replace(/\.md$/, "");
}
