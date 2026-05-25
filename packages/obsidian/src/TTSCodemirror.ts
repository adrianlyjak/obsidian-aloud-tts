import { Extension } from "@codemirror/state";
import { EditorView, Panel, showPanel } from "@codemirror/view";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { AudioSink, AudioStore, TTSPluginSettingsStore } from "open-tts";
import {
  createDOM,
  destroyDOM,
  createLoadingSpinnerExtension,
  createTTSHighlightExtension,
  ObsidianLoadingWidgetFactory,
  PlayerView,
} from "@open-tts/ui";
import { ObsidianBridge } from "./ObsidianBridge";
import { ObsidianTooltipProvider } from "./util/ObsidianTooltipService";

type SinkWithElement = AudioSink & { audioElement?: HTMLAudioElement };

function isMobilePhone(obsidian: ObsidianBridge): boolean {
  return obsidian.isMobile() && window.innerWidth < 600;
}

function shouldShowPlayerView(
  editor: EditorView,
  player: AudioStore,
  settings: TTSPluginSettingsStore,
  obsidian: ObsidianBridge,
): boolean {
  const hasText = !!player.activeText;
  const isActiveEditor =
    editor === obsidian.activeEditor || obsidian.detachedAudio;
  const isFocusedEditor = obsidian.focusedEditor === editor;
  switch (settings.settings.showPlayerView) {
    case "always":
      return isFocusedEditor || isActiveEditor;
    case "never":
      return false;
    case "always-mobile":
      return obsidian.isMobile()
        ? isFocusedEditor || isActiveEditor
        : isActiveEditor && hasText;
    case "playing":
      return isActiveEditor && hasText;
  }
}

function getSelectedText(editor: EditorView): string {
  const selection = editor.state.selection.main;
  if (selection.from === selection.to) {
    return "";
  }
  return editor.state.doc.sliceString(selection.from, selection.to);
}

function playerPanel(
  editor: EditorView,
  player: AudioStore,
  settings: TTSPluginSettingsStore,
  sink: AudioSink,
  obsidian: ObsidianBridge,
): Panel {
  const dom = document.createElement("div");
  dom.classList.add("tts-toolbar");
  const root = createRoot(dom);
  root.render(
    React.createElement(ObsidianTooltipProvider, {
      children: React.createElement(PlayerView, {
        player,
        settings,
        sink,
        shouldShow: () =>
          shouldShowPlayerView(editor, player, settings, obsidian),
        isMobilePhone: () => isMobilePhone(obsidian),
        audioElement: (sink as SinkWithElement).audioElement,
        onOpenSettings: () => obsidian.openSettings(),
        onPlaySelection: () => obsidian.playSelection(),
        onExportSelectionAudio: () => {
          const text = getSelectedText(editor);
          if (!text.trim()) {
            return;
          }
          obsidian.exportAudio(text, false).catch((ex) => {
            console.error("Couldn't export selection audio!", ex);
          });
        },
        canExportSelectionAudio: () => !!getSelectedText(editor).trim(),
        onSaveDocumentAudio: () => {
          obsidian.saveDocumentAudio().catch((ex) => {
            console.error("Couldn't save document audio!", ex);
          });
        },
      }),
    }),
  );
  return {
    dom,
    top: true,
    update() {},
  };
}

const obsidianTheme = EditorView.theme({
  ".cm-panels-top": {
    borderBottom: `1px solid var(--background-modifier-border)`,
  },
  ".tts-cm-playing-before, .tts-cm-playing-after": {
    backgroundColor: "rgba(var(--color-purple-rgb), 0.2)",
  },
  ".tts-cm-playing-now": {
    backgroundColor: "rgba(var(--color-purple-rgb), 0.4)",
  },
});

export function TTSCodeMirror(
  player: AudioStore,
  settings: TTSPluginSettingsStore,
  sink: AudioSink,
  obsidian: ObsidianBridge,
): Extension {
  const loadingWidgetFactory = new ObsidianLoadingWidgetFactory(
    createDOM,
    destroyDOM,
  );

  return [
    createTTSHighlightExtension(
      player,
      obsidian,
      settings.settings,
      obsidianTheme,
      ({ from, to }) => {
        const obsidianEditor = obsidian.activeObsidianEditor;
        if (!obsidianEditor) {
          return;
        }
        const fromPos = obsidianEditor.offsetToPos(from);
        const toPos = obsidianEditor.offsetToPos(to);
        player.markProgrammaticScroll();
        obsidianEditor.scrollIntoView({ from: fromPos, to: toPos }, true);
      },
    ),
    showPanel.of((editorView: EditorView) =>
      playerPanel(editorView, player, settings, sink, obsidian),
    ),
    createLoadingSpinnerExtension(loadingWidgetFactory),
  ];
}
