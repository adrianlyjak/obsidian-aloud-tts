import { observer } from "mobx-react-lite";
import * as React from "react";
import { AudioLines } from "lucide-react";
import { AudioStore } from "open-tts";
import { AudioVisualizer } from "./AudioVisualizer";

export interface EditorActionIconProps {
  player: AudioStore;
  audioElement?: HTMLAudioElement;
}

/**
 * Reactive icon for the editor action button.
 * Shows a 6-bar mini AudioVisualizer when playing, otherwise shows audio-lines icon.
 */
export const EditorActionIcon = observer(
  ({ player, audioElement }: EditorActionIconProps): React.ReactElement => {
    const activeText = player.activeText;
    const isPlaying = activeText?.isPlaying ?? false;
    const currentChunk = activeText?.currentChunk;
    const decodedAudio = currentChunk?.decodedAudio;
    const timelineStart = currentChunk?.timelineStartSeconds;

    if (isPlaying && audioElement && decodedAudio && timelineStart != null) {
      // Show 5-bar mini AudioVisualizer when playing
      return (
        <AudioVisualizer
          audioElement={audioElement}
          decodedAudio={decodedAudio}
          timelineStartSeconds={timelineStart}
          className="tts-editor-action-visualizer"
        />
      );
    }

    // Show static audio-lines icon when not playing
    return <AudioLines size={18} />;
  },
);
