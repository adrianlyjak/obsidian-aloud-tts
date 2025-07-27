import * as React from "react";
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { AudioStore } from "../../player/AudioStore";
import {
  createTTSHighlightExtension,
  createPlayerSynchronizer,
} from "../../codemirror/TTSCodeMirrorCore";
import { WebObsidianBridge } from "./WebBridge";

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

const STORAGE_KEYS = {
  EDITOR_TEXT: "tts-editor-text",
};

export const WebEditor: React.FC<{
  store: AudioStore;
  onEditorReady: (editor: EditorView) => void;
  bridge: WebObsidianBridge;
}> = ({ store, onEditorReady, bridge }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const syncDisposerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Load persisted text
    const savedText =
      localStorage.getItem(STORAGE_KEYS.EDITOR_TEXT) ||
      "Welcome to the TTS Web App!\n\nType your text here and use the player controls to listen to it.\n\nYour text will be automatically saved as you type.";

    // Custom theme for web version
    const webTTSTheme = EditorView.theme({
      ".tts-cm-playing-before, .tts-cm-playing-after": {
        backgroundColor: "rgba(28, 107, 198, 0.48)", // Purple with transparency
      },
      ".tts-cm-playing-now": {
        backgroundColor: "rgba(45, 119, 237, 0.64)", // Brighter purple
      },
    });

    const state = EditorState.create({
      doc: savedText,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        // Use shared TTS extension
        createTTSHighlightExtension(store, bridge, webTTSTheme),
        // Save text on changes
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            localStorage.setItem(STORAGE_KEYS.EDITOR_TEXT, text);
          }
        }),
        EditorView.theme({
          "&": {
            backgroundColor: THEME.background.primary,
            color: THEME.text.primary,
          },
          ".cm-content": {
            backgroundColor: THEME.background.primary,
            color: THEME.text.primary,
            padding: "16px",
            fontSize: "14px",
            lineHeight: "1.6",
            caretColor: "#ffffff !important",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-editor": {
            backgroundColor: THEME.background.primary,
          },
          ".cm-scroller": {
            backgroundColor: THEME.background.primary,
          },
          ".cm-gutter": {
            backgroundColor: THEME.background.secondary,
            borderRight: `1px solid ${THEME.border.primary}`,
            color: THEME.text.secondary,
          },
          ".cm-gutters": {
            backgroundColor: THEME.background.secondary,
            borderRight: `1px solid ${THEME.border.primary}`,
          },
          ".cm-lineNumbers .cm-gutterElement": {
            color: THEME.text.muted,
            padding: "0 8px",
          },
          ".cm-selectionBackground": {
            backgroundColor: `${THEME.accent.primary}40`,
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    editorViewRef.current = view;
    bridge.setActiveEditor(view);
    onEditorReady(view);

    // Set up synchronization with AudioStore using shared logic
    const disposeSync = createPlayerSynchronizer(store, bridge);
    syncDisposerRef.current = disposeSync;

    return () => {
      if (syncDisposerRef.current) {
        syncDisposerRef.current();
        syncDisposerRef.current = null;
      }
      bridge.setActiveEditor(undefined);
      view.destroy();
    };
  }, [store, onEditorReady, bridge]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: THEME.background.primary,
      }}
    >
      <div
        ref={editorRef}
        style={{
          flex: 1,
          fontSize: "14px",
        }}
      />
    </div>
  );
};
