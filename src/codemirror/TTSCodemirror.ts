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
import { AudioStore } from "../player/Player";

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
  obsidian: ObsidianBridge
): Panel {
  const dom = document.createElement("div");
  const root = createRoot(dom);
  root.render(
    React.createElement(PlayerView, {
      editor,
      player,
      settings,
      obsidian,
      sink,
    })
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
    playingTrack?: string;
    tracks?: string[];
  };
  decoration?: DecorationSet;
}

function playerToCodeMirrorState(player: AudioStore): TTSCodeMirrorState {
  if (player.activeText) {
    const currentTrack = player.activeText.currentTrack;

    return {
      playerState: {
        isPlaying: player.activeText.isPlaying,
        playingTrack: currentTrack.text,
        tracks: player.activeText.audio.tracks.map((x) => x.text),
      },
    };
  } else {
    return {};
  }
}

const field = StateField.define<TTSCodeMirrorState>({
  create() {
    return {};
  },
  update(value, tr): TTSCodeMirrorState {
    const effects: StateEffect<TTSCodeMirrorState>[] = tr.effects.flatMap((e) =>
      e.is(setViewState) ? [e] : []
    );
    if (!effects && !tr.docChanged) {
      return value;
    }

    const currentState = effects.reverse()[0]?.value || value;

    let currentTextPosition: { from: number; to: number } | undefined;
    let textPosition: { from: number; to: number } | undefined;
    if (currentState.playerState?.playingTrack) {
      const doc = tr.state.doc.toString();
      const index = doc.indexOf(currentState.playerState.playingTrack);
      if (index > -1) {
        currentTextPosition = {
          from: index,
          to: index + currentState.playerState.playingTrack.length,
        };
      }

      const fullText = (currentState.playerState?.tracks || []).join("");
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
          })
        );
      }
      b.add(
        currentTextPosition.from,
        currentTextPosition.to,
        Decoration.mark({
          class: "tts-cm-playing-now",
        })
      );
      if (textPosition) {
        b.add(
          currentTextPosition.to,
          textPosition.to,
          Decoration.mark({
            class: "tts-cm-playing-after",
          })
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
      (x) => x.decoration || Decoration.none
    );
  },
});

function synchronize(player: AudioStore, obsidian: ObsidianBridge): void {
  // - listen for player changes with mobx and propagate to codemirror
  // - listen for focused code mirror instance and dispatch to that one
  // - keep reference to previous codemirror instance in order to deactivate it once a new command
  //   goes to a new focused instance
  // - should only apply changes that are relevant to current file...
  //   but this extension is applied to all files? How can I couple the extension instance to which file it exists in? So that it's
  //   not needlessly executing on paused editors.
  // - somehow bubble out commands back out to mobx to e.g. pause playback. Need to be careful to prevent feedback loops from the event handlers
  // - does the user need a global way to pause playback? Should the play state show playing in each editor?

  mobx.reaction(
    () =>
      [playerToCodeMirrorState(player), obsidian.activeEditor] as [
        TTSCodeMirrorState,
        EditorView | undefined
      ],
    (
      [newState, newEditor]: [TTSCodeMirrorState, EditorView | undefined],
      previousState?: [TTSCodeMirrorState, EditorView | undefined]
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
    }
  );
}

const theme = EditorView.theme({
  ".cm-panels-top": {
    borderBottom: `1px solid var(--background-modifier-border)`,
  },
  ".cm-panels-top .cm-tts-word-count": {
    // backgroundColor: "var(--background-secondary)",
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
  obsidian: ObsidianBridge
): Extension {
  synchronize(player, obsidian);
  return [
    field,
    theme,
    showPanel.of((editorView: EditorView) =>
      playerPanel(editorView, player, settings, sink, obsidian)
    ),
  ];
}
