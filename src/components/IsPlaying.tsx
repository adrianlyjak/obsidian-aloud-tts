import { EditorView } from "@codemirror/view";
import { observer } from "mobx-react-lite";
import * as React from "react";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import { AudioStore } from "../player/AudioStore";
import { IconSpan } from "./IconButton";

export const IsPlaying = observer(
  ({
    audio,
    bridge,
    editor,
  }: {
    audio: AudioStore;
    bridge: ObsidianBridge;
    editor: EditorView;
  }) => {
    const isPlaying =
      (audio.activeText?.isPlaying && bridge.activeEditor === editor) || false;
    if (isPlaying) {
      return <IconSpan icon="volume-2" />;
    } else {
      return null;
    }
  },
);
