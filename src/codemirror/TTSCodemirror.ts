import {
  Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  showPanel,
} from "@codemirror/view";
import * as mobx from "mobx";
import { AudioSink } from "../player/AudioSink";
import { AudioStore, AudioTextTrack } from "../player/Player";

import * as React from "react";
import { createRoot } from "react-dom/client";

import { Panel } from "@codemirror/view";
import { ObsidianBridge } from "src/obsidian/ObsidianBridge";
import { PlayerView } from "../components/PlayerView";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";

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
      // TODO - handle selection change, fuzzy match
    },
  };
}

const setViewState = StateEffect.define<TTSCodeMirrorState>();

interface TTSCodeMirrorState {
  playerState?: {
    isPlaying: boolean;
    playingTrack?: AudioTextTrack;
    tracks?: AudioTextTrack[];
  };
  decoration?: DecorationSet;
}

function playerToCodeMirrorState(player: AudioStore): TTSCodeMirrorState {
  if (player.activeText) {
    const currentTrack = player.activeText.currentTrack;

    return {
      playerState: {
        isPlaying: player.activeText.isPlaying,
        playingTrack: currentTrack,
        tracks: player.activeText.audio.tracks,
      },
    };
  } else {
    return {};
  }
}

/** Highlights the currently selected and playing text */
const field = StateField.define<TTSCodeMirrorState>({
  create() {
    return {};
  },
  update(value, tr): TTSCodeMirrorState {
    const effects: StateEffect<TTSCodeMirrorState>[] = tr.effects.flatMap(
      (e) => (e.is(setViewState) ? [e] : []),
    );
    if (!effects && !tr.docChanged) {
      return value;
    }

    const currentState = effects.reverse()[0]?.value || value;

    let currentTextPosition: { from: number; to: number } | undefined;
    let textPosition: { from: number; to: number } | undefined;
    if (currentState.playerState?.playingTrack) {
      const doc = tr.state.doc.toString();
      const index = doc.indexOf(currentState.playerState.playingTrack?.rawText);
      if (index > -1) {
        currentTextPosition = {
          from: index,
          to: index + currentState.playerState.playingTrack!.rawText.length,
        };
      }

      const fullText = (currentState.playerState?.tracks || []).map(x => x.rawText).join("");
      const fullIndex = doc.indexOf(fullText);

      if (fullIndex > -1) {
        textPosition = {
          from: fullIndex,
          to: fullIndex + fullText.length,
        };
      }
    }

    if (!currentTextPosition) {
      // destructo?
      return {
        playerState: currentState.playerState,
      };
    } else {
      const b = new RangeSetBuilder<Decoration>();
      if (textPosition) {
        b.add(
          textPosition.from,
          currentTextPosition.from,
          Decoration.mark({
            class: "tts-cm-playing-before",
          }),
        );
      }
      b.add(
        currentTextPosition.from,
        currentTextPosition.to,
        Decoration.mark({
          class: "tts-cm-playing-now",
        }),
      );
      if (textPosition) {
        b.add(
          currentTextPosition.to,
          textPosition.to,
          Decoration.mark({
            class: "tts-cm-playing-after",
          }),
        );
      }
      return {
        playerState: currentState.playerState,
        decoration: b.finish(),
      };
    }
  },
  provide: (field) => {
    return EditorView.decorations.from(
      field,
      (x) => x.decoration || Decoration.none,
    );
  },
});

/** sends commands to just the current editor, cleaning up old editors */
function synchronize(player: AudioStore, obsidian: ObsidianBridge): void {
  mobx.reaction(
    () =>
      [playerToCodeMirrorState(player), obsidian.activeEditor] as [
        TTSCodeMirrorState,
        EditorView | undefined,
      ],
    (
      [newState, newEditor]: [TTSCodeMirrorState, EditorView | undefined],
      previousState?: [TTSCodeMirrorState, EditorView | undefined],
    ) => {
      if (previousState?.[1] && previousState[1] !== newEditor) {
        previousState[1].dispatch({
          effects: setViewState.of({}),
        });
      }
      if (newEditor) {
        newEditor.dispatch({
          effects: setViewState.of(newState),
        });
      }
    },
    {
      fireImmediately: true,
      equals: mobx.comparer.structural,
    },
  );
}

const theme = EditorView.theme({
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
  synchronize(player, obsidian);
  return [
    field,
    theme,
    showPanel.of((editorView: EditorView) =>
      playerPanel(editorView, player, settings, sink, obsidian),
    ),
  ];
}
