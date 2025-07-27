import { Extension } from "@codemirror/state";
import { EditorView, showPanel } from "@codemirror/view";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/AudioStore";

import * as React from "react";
import { createRoot } from "react-dom/client";

import { Panel } from "@codemirror/view";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import { PlayerView } from "../components/PlayerView";
import { createDOM } from "../components/DownloadProgress";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";
import {
  createTTSHighlightExtension,
  createPlayerSynchronizer,
} from "./TTSCodeMirrorCore";
import {
  createLoadingSpinnerExtension,
  ObsidianLoadingWidgetFactory,
} from "./TTSLoadingExtension";

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
    React.createElement(PlayerView, {
      editor,
      player,
      settings,
      obsidian,
      sink,
    }),
  );
  return {
    dom,
    top: true,
    update(update) {
      // Panel-specific update logic can stay here
      // Text change handling is now in the shared core
    },
  };
}

// Obsidian-specific theme using CSS variables
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
  // Set up synchronization using shared logic
  // Note: disposer cleanup is handled automatically when the extension is destroyed
  createPlayerSynchronizer(player, obsidian);

  // Create Obsidian-specific loading widget factory
  const loadingWidgetFactory = new ObsidianLoadingWidgetFactory(createDOM);

  return [
    // Use shared TTS highlighting extension
    createTTSHighlightExtension(player, obsidian, obsidianTheme),
    // Obsidian-specific panel
    showPanel.of((editorView: EditorView) =>
      playerPanel(editorView, player, settings, sink, obsidian),
    ),
    // Use shared loading spinner extension
    createLoadingSpinnerExtension(loadingWidgetFactory),
  ];
}
