import * as React from "react";
import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { EditorView } from "@codemirror/view";
import { AudioStore } from "../../player/AudioStore";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { WebAudioSink } from "../../player/AudioSink";
import { IconButton } from "../../components/IconButton";
import { PlayerView } from "../../components/PlayerView";

// Theme colors - same as in app.tsx
const THEME = {
  background: {
    primary: "#1e1e1e",
    secondary: "#252526",
    tertiary: "#2d2d30",
  },
  border: {
    primary: "#3e3e42",
    secondary: "#404040",
  },
  text: {
    primary: "#cccccc",
    secondary: "#969696",
    muted: "#6a6a6a",
  },
  accent: {
    primary: "#007acc",
    hover: "#1177bb",
  },
};

// Simple ObsidianBridge adapter for web environment
export interface WebObsidianBridge {
  activeEditor: EditorView | undefined;
  focusedEditor: EditorView | undefined;
  detachedAudio: boolean;
  setActiveEditor: (editor: EditorView | undefined) => void;
  playSelection: () => void;
  playDetached: (text: string) => void;
  onTextChanged: (
    position: number,
    type: "add" | "remove",
    text: string,
  ) => void;
  triggerSelection: () => void;
  openSettings: () => void;
  destroy: () => void;
  isMobile: () => boolean;
  exportAudio: (text: string, replaceSelection?: boolean) => Promise<void>;
}

export const CommandBar: React.FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
  sink: WebAudioSink;
  editor: EditorView | undefined;
  obsidian: WebObsidianBridge | undefined;
  onOpenSettings: () => void;
}> = observer(
  ({ settingsStore, store, sink, editor, obsidian, onOpenSettings }) => {
    const handlePlayFromCursor = useCallback(() => {
      if (editor) {
        const state = editor.state;
        const cursor = state.selection.main.head;
        const doc = state.doc;

        // Get text from cursor to end of document
        const textFromCursor = doc.sliceString(cursor);

        if (textFromCursor.trim()) {
          store.startPlayer({
            filename: "editor.md",
            text: textFromCursor,
            start: cursor,
            end: doc.length,
          });
        }
      }
    }, [editor, store]);

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: `1px solid ${THEME.border.primary}`,
          backgroundColor: THEME.background.secondary,
          minHeight: "40px",
        }}
      >
        {/* Settings gear icon */}
        <IconButton
          icon="settings"
          tooltip="Settings"
          onClick={onOpenSettings}
        />

        <IconButton
          icon="file-text"
          tooltip="Play from Cursor"
          onClick={handlePlayFromCursor}
          disabled={!editor}
        />

        {/* Separator */}
        <div
          style={{
            width: "1px",
            height: "20px",
            backgroundColor: THEME.border.primary,
            margin: "0 4px",
          }}
        />

        {/* PlayerView controls when available */}
        {editor && settingsStore && obsidian && (
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <PlayerView
              editor={editor}
              player={store}
              settings={settingsStore}
              sink={sink}
              obsidian={obsidian}
            />
          </div>
        )}
      </div>
    );
  },
);
