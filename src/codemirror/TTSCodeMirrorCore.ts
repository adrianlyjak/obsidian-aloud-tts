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
  ViewUpdate,
} from "@codemirror/view";
import * as mobx from "mobx";
import { AudioStore } from "../player/AudioStore";
import { AudioTextChunk } from "../player/AudioTextChunk";
import { TextEdit } from "../player/ActiveAudioText";

// Unified bridge interface - common subset that both implementations need
export interface TTSEditorBridge {
  /** editor that is currently playing audio */
  activeEditor: EditorView | undefined;
  /** editor that has cursor */
  focusedEditor: EditorView | undefined;
  /** set true when playing from the clipboard or other transient audio */
  detachedAudio: boolean;
  playSelection: () => void;
  playDetached: (text: string) => void;
  onTextChanged: (
    position: number,
    type: "add" | "remove",
    text: string,
  ) => void;
  openSettings: () => void;
  destroy: () => void;
  isMobile: () => boolean;
  exportAudio: (text: string, replaceSelection?: boolean) => Promise<void>;
}

// State Management
const setViewState = StateEffect.define<TTSCodeMirrorState>();

export interface TTSCodeMirrorState {
  playerState?: {
    isPlaying: boolean;
    playingTrack?: AudioTextChunk;
    tracks?: AudioTextChunk[];
  };
  decoration?: DecorationSet;
}

export function playerToCodeMirrorState(
  player: AudioStore,
): TTSCodeMirrorState {
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
const ttsHighlightField = StateField.define<TTSCodeMirrorState>({
  create() {
    return {};
  },
  update(value, tr): TTSCodeMirrorState {
    const effects: StateEffect<TTSCodeMirrorState>[] = tr.effects.flatMap(
      (e) => (e.is(setViewState) ? [e] : []),
    );
    if (!effects.length && !tr.docChanged) {
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

/** Handle text changes for TTS */
export function createTextChangeHandler(
  player: AudioStore,
  bridge: TTSEditorBridge,
) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged && bridge.activeEditor === update.view) {
      // Loop through each change in the transaction
      update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const addedText = inserted.toString();
        const removedText = update.startState.doc.sliceString(fromA, toA);

        // Defer the update to avoid updating during update
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
          if (updates.length && player.activeText) {
            player.activeText.onMultiTextChanged(updates);
          }
        }, 0);
      });
    }
  });
}

/** Synchronize player state with editor highlighting */
export function createPlayerSynchronizer(
  player: AudioStore,
  bridge: TTSEditorBridge,
): () => void {
  type State = {
    state: TTSCodeMirrorState;
    editorView: EditorView | undefined;
  };

  return mobx.reaction(
    () =>
      ({
        state: playerToCodeMirrorState(player),
        editorView: bridge.activeEditor,
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

/** Core TTS highlighting extension */
export function createTTSHighlightExtension(
  player: AudioStore,
  bridge: TTSEditorBridge,
  customTheme?: Extension,
): Extension {
  const defaultTheme = EditorView.theme({
    ".tts-cm-playing-before, .tts-cm-playing-after": {
      backgroundColor: "rgba(128, 0, 128, 0.2)",
    },
    ".tts-cm-playing-now": {
      backgroundColor: "rgba(128, 0, 128, 0.4)",
    },
  });

  return [
    ttsHighlightField,
    customTheme || defaultTheme,
    createTextChangeHandler(player, bridge),
  ];
}

// Export the state effect for manual dispatching
export { setViewState };
