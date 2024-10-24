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
  PluginValue,
  showPanel,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import * as mobx from "mobx";
import { AudioSink } from "../player/AudioSink";
import { AudioStore } from "../player/AudioStore";

import * as React from "react";
import { createRoot } from "react-dom/client";

import { Panel } from "@codemirror/view";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import { PlayerView } from "../components/PlayerView";
import { createDOM } from "../components/DownloadProgress";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";
import { TextEdit } from "../player/ActiveAudioText";
import { AudioTextChunk } from "../player/AudioTextChunk";

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
      if (update.docChanged && obsidian.activeEditor === editor) {
        // Loop through each change in the transaction
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          const addedText = inserted.toString();
          const removedText = update.startState.doc.sliceString(fromA, toA);

          // this is fugly. Can't make an update in an update, so defer it
          setTimeout(() => {
            const updates: TextEdit[] = [];
            if (removedText) {
              updates.push({
                position: fromA,
                type: "remove",
                text: removedText,
              });
            }
            if (addedText) {
              updates.push({ position: fromA, type: "add", text: addedText });
            }
            if (updates.length) {
              player.activeText?.onMultiTextChanged(updates);
            }
          }, 0);
        });
      }
      // TODO - handle selection change, fuzzy match
    },
  };
}

const setViewState = StateEffect.define<TTSCodeMirrorState>();

interface TTSCodeMirrorState {
  playerState?: {
    isPlaying: boolean;
    playingTrack?: AudioTextChunk;
    tracks?: AudioTextChunk[];
  };
  decoration?: DecorationSet;
}

function playerToCodeMirrorState(player: AudioStore): TTSCodeMirrorState {
  if (player.activeText) {
    const currentTrack = player.activeText.currentChunk;

    return {
      playerState: {
        isPlaying: player.activeText.isPlaying && !!currentTrack,
        playingTrack: currentTrack || undefined,
        tracks: mobx.toJS(player.activeText.audio.chunks) || [],
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
    // reset code-mirror highlights when text changes or when external track state changes

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
      const tracks = currentState.playerState.tracks;
      if (tracks?.length) {
        textPosition = {
          from: tracks.at(0)!.start,
          to: tracks.at(-1)!.end,
        };
      }
      const active = currentState.playerState.playingTrack;
      if (active) {
        currentTextPosition = {
          from: active.start,
          to: active.end,
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

/** serializes state from mobx-application, and sends events describing the changes */
function synchronize(player: AudioStore, obsidian: ObsidianBridge): void {
  type State = {
    state: TTSCodeMirrorState;
    editorView: EditorView | undefined;
  };
  mobx.reaction(
    () =>
      ({
        state: playerToCodeMirrorState(player),
        editorView: obsidian.activeEditor,
      }) as State,
    ({ state: newState, editorView: newEditor }: State, previous?: State) => {
      if (previous?.editorView && previous.editorView !== newEditor) {
        previous.editorView.dispatch({
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
    loadingSpinnerExtension,
  ];
}

class LoadingSpinnerExtension implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.createDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.createDecorations(update.view);
    }
  }

  createDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const { from, to } = view.viewport;
    const text = view.state.doc.sliceString(from, to);
    const regex = /<loading file="(.+?)" \/>/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const file = match[1];

      const deco = Decoration.widget({
        widget: new LoadingSpinnerWidget(file),
      });
      builder.add(start, end, deco);
    }

    const decos = builder.finish();
    return decos;
  }
}
const loadingSpinnerExtension = ViewPlugin.fromClass(LoadingSpinnerExtension, {
  decorations: (v: LoadingSpinnerExtension): DecorationSet => v.decorations,
});

class LoadingSpinnerWidget extends WidgetType {
  constructor(private file: string) {
    super();
  }

  toDOM() {
    return createDOM({ file: this.file });
  }

  ignoreEvent() {
    return true;
  }
  eq(that: LoadingSpinnerWidget) {
    return this.file === that.file;
  }
  updateDOM() {
    return false;
  }
}
