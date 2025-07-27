import * as React from "react";
import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { EditorView } from "@codemirror/view";
import { AudioStore } from "../../player/AudioStore";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { WebAudioSink } from "../../player/AudioSink";
import { IconButton } from "../../components/IconButton";
import { PlayerView } from "../../components/PlayerView";
import { WebObsidianBridge } from "./WebBridge";

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
      // Use the bridge's triggerSelection which handles selection vs cursor properly
      obsidian?.triggerSelection();
    }, [obsidian]);

    const handleExportSelection = useCallback(() => {
      if (!editor || !obsidian) return;

      const state = editor.state;
      const selection = state.selection.main;
      const doc = state.doc;

      // Get selected text or all text if nothing selected
      const text =
        selection.from !== selection.to
          ? doc.sliceString(selection.from, selection.to)
          : doc.toString();

      if (text.trim()) {
        obsidian.exportAudio(text, false);
      }
    }, [editor, obsidian]);

    const _handleExportFromClipboard = useCallback(async () => {
      if (!obsidian) return;

      try {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          obsidian.exportAudio(text, false);
        }
      } catch (ex) {
        console.error("Failed to read clipboard", ex);
        alert("Failed to read clipboard");
      }
    }, [obsidian]);

    return (
      <div className="web-tts-command-bar">
        {/* Settings gear icon */}
        <IconButton
          icon="settings"
          tooltip="Settings"
          onClick={onOpenSettings}
        />

        <IconButton
          icon="play"
          tooltip="Play Selection (or from Cursor)"
          onClick={handlePlayFromCursor}
          disabled={!editor}
        />

        <IconButton
          icon="download"
          tooltip="Export Selection to Audio"
          onClick={handleExportSelection}
          disabled={!editor}
        />
        {/* Separator */}
        <div className="web-tts-command-bar-separator" />

        {/* PlayerView controls when available */}
        {editor && settingsStore && obsidian && (
          <div className="web-tts-command-bar-player">
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
