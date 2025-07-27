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
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
          },
          ".cm-content": {
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            padding: "16px",
            fontSize: "14px",
            lineHeight: "1.6",
            caretColor: "#ffffff !important",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-editor": {
            backgroundColor: "var(--bg-primary)",
          },
          ".cm-scroller": {
            backgroundColor: "var(--bg-primary)",
          },
          ".cm-gutter": {
            backgroundColor: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-primary)",
            color: "var(--text-secondary)",
          },
          ".cm-gutters": {
            backgroundColor: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-primary)",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            color: "var(--text-muted)",
            padding: "0 8px",
          },
          ".cm-selectionBackground": {
            backgroundColor: "rgba(0, 122, 204, 0.25)",
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
    <div className="tts-web-editor">
      <div ref={editorRef} className="tts-web-editor-container" />
    </div>
  );
};
