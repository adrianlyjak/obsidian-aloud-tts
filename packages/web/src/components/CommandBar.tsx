import * as React from "react";
import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { EditorView } from "@codemirror/view";
import { AudioStore } from "open-tts";
import { TTSPluginSettingsStore } from "open-tts";
import { WebAudioSink } from "open-tts/browser";
import { IconButton } from "@open-tts/ui";
import { PlayerView } from "@open-tts/ui";
import { ToolbarOverflowMenu } from "@open-tts/ui";
import { WebObsidianBridge } from "./WebBridge";

function getSelectedText(editor: EditorView | undefined): string {
  if (!editor) {
    return "";
  }

  const state = editor.state;
  const selection = state.selection.main;
  if (selection.from === selection.to) {
    return "";
  }

  return state.doc.sliceString(selection.from, selection.to);
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
    const hasText = !!store.activeText;
    const isActiveEditor =
      !!editor &&
      (editor === obsidian?.activeEditor || !!obsidian?.detachedAudio);
    const isFocusedEditor = !!editor && obsidian?.focusedEditor === editor;
    let shouldShowPlayer = false;
    switch (settingsStore.settings.showPlayerView) {
      case "always":
        shouldShowPlayer = isFocusedEditor || isActiveEditor;
        break;
      case "never":
        shouldShowPlayer = false;
        break;
      case "always-mobile":
        shouldShowPlayer = obsidian?.isMobile()
          ? isFocusedEditor || isActiveEditor
          : isActiveEditor && hasText;
        break;
      case "playing":
        shouldShowPlayer = isActiveEditor && hasText;
        break;
    }

    const handlePlayFromCursor = useCallback(() => {
      // Use the bridge's triggerSelection which handles selection vs cursor properly
      obsidian?.triggerSelection();
    }, [obsidian]);

    const handleExportSelection = useCallback(() => {
      if (!editor || !obsidian) return;

      const text = getSelectedText(editor);

      if (text.trim()) {
        obsidian.exportAudio(text, false);
      }
    }, [editor, obsidian]);

    const handleSaveDocumentAudio = useCallback(() => {
      obsidian?.saveDocumentAudio().catch((ex) => {
        console.error("Couldn't save document audio!", ex);
      });
    }, [obsidian]);

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

        {/* Separator */}
        <div className="web-tts-command-bar-separator" />

        {/* PlayerView controls when available */}
        {editor && settingsStore && obsidian && (
          <div className="web-tts-command-bar-player">
            <PlayerView
              player={store}
              settings={settingsStore}
              sink={sink}
              shouldShow={shouldShowPlayer}
              isMobilePhone={!!obsidian?.isMobile() && window.innerWidth < 600}
              audioElement={sink.audioElement}
              onOpenSettings={onOpenSettings}
              onPlaySelection={() => obsidian.playSelection()}
            />
          </div>
        )}

        <ToolbarOverflowMenu
          items={[
            {
              id: "export-selection-audio",
              label: "Export selection as audio...",
              disabled: () =>
                !editor ||
                !getSelectedText(editor).trim() ||
                !!store.exportProgress,
              onSelect: handleExportSelection,
            },
            {
              id: "save-document-audio",
              label: "Save document as audio...",
              disabled: () => !editor || !obsidian || !!store.exportProgress,
              onSelect: handleSaveDocumentAudio,
            },
          ]}
        />
      </div>
    );
  },
);
