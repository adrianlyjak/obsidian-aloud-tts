import { EditorView } from "@codemirror/view";
import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import { AudioStore } from "../player/AudioStore";
import { ObsidianIconSpan } from "./ObsidianIconSpan";

export const IsPlaying = observer(
  ({
    audio,
    bridge,
    editor,
    className,
  }: {
    audio: AudioStore;
    bridge: ObsidianBridge;
    editor: EditorView;
    className?: string;
  }) => {
    const isPlaying =
      (audio.activeText?.isPlaying && bridge.activeEditor === editor) || false;
    if (isPlaying) {
      return <ObsidianIconSpan icon="volume-2" className={className} />;
    } else {
      return null;
    }
  },
);
