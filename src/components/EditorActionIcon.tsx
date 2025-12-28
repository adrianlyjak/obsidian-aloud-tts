import { observer } from "mobx-react-lite";
import * as React from "react";
import { AudioLines } from "lucide-react";
import { AudioStore } from "../player/AudioStore";
import { AudioSink } from "../player/AudioSink";
import { AudioVisualizer } from "./AudioVisualizer";

export interface EditorActionIconProps {
  player: AudioStore;
  sink: AudioSink;
}

/**
 * Reactive icon for the editor action button.
 * Shows a 6-bar mini AudioVisualizer when playing, otherwise shows audio-lines icon.
 */
export const EditorActionIcon = observer(
  ({ player, sink }: EditorActionIconProps): React.ReactElement => {
    const activeText = player.activeText;
    const isPlaying = activeText?.isPlaying ?? false;
    const currentChunk = activeText?.currentChunk;
    const audioBuffer = currentChunk?.audioBuffer;
    const offsetDuration = currentChunk?.offsetDuration;

    if (
      isPlaying &&
      sink.audio &&
      audioBuffer &&
      offsetDuration !== undefined
    ) {
      // Show 5-bar mini AudioVisualizer when playing
      return (
        <AudioVisualizer
          audioElement={sink.audio}
          audioBuffer={audioBuffer}
          offsetDurationSeconds={offsetDuration}
          className="tts-editor-action-visualizer"
        />
      );
    }

    // Show static audio-lines icon when not playing
    return <AudioLines size={18} />;
  },
);
