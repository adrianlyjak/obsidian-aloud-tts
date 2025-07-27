import * as React from "react";
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, ViewUpdate } from "@codemirror/view";
import { AudioStore } from "../../player/AudioStore";

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
}> = ({ store, onEditorReady }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Load persisted text
    const savedText =
      localStorage.getItem(STORAGE_KEYS.EDITOR_TEXT) ||
      "Welcome to the TTS Web App!\n\nType your text here and use the player controls to listen to it.\n\nYour text will be automatically saved as you type.";

    const state = EditorState.create({
      doc: savedText,
      extensions: [
        lineNumbers(),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            localStorage.setItem(STORAGE_KEYS.EDITOR_TEXT, text);
          }
        }),
        EditorView.lineWrapping,
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
          ".cm-cursor": {
            borderLeftColor: THEME.text.primary,
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
    onEditorReady(view);

    return () => {
      view.destroy();
    };
  }, [onEditorReady]);

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
