import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import {
  pluginSettingsStore,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";
import { WebAudioSink } from "../player/AudioSink";
import * as React from "react";
import { useEffect, useState, type FC, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import { REGISTRY } from "../models/registry";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, ViewUpdate } from "@codemirror/view";
import { TTSSettingsTabComponent } from "../components/TTSSettingsTabComponent";
import { TooltipProvider } from "../util/TooltipContext";
import { PlayerView } from "../components/PlayerView";
import { ObsidianBridge } from "../obsidian/ObsidianBridge";
import { IconButton } from "../components/IconButton";

const STORAGE_KEYS = {
  SETTINGS: "tts-settings",
  EDITOR_TEXT: "tts-editor-text",
};

// Theme colors - structured for future toggling
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

// Simple ObsidianBridge adapter for web environment
class WebObsidianBridge implements ObsidianBridge {
  activeEditor: EditorView | undefined = undefined;
  focusedEditor: EditorView | undefined = undefined;
  detachedAudio: boolean = false;

  constructor(
    private store: AudioStore,
    private onOpenSettings: () => void,
  ) {}

  setActiveEditor(editor: EditorView | undefined) {
    this.activeEditor = editor;
    this.focusedEditor = editor;
  }

  playSelection = () => {
    if (this.activeEditor) {
      const text = this.activeEditor.state.doc.toString();
      if (text.trim()) {
        this.store.startPlayer({
          filename: "editor.md",
          text,
          start: 0,
          end: text.length,
        });
      }
    }
  };

  playDetached = (text: string) => {
    this.detachedAudio = true;
    this.store.startPlayer({
      filename: "detached.md",
      text,
      start: 0,
      end: text.length,
    });
  };

  onTextChanged = (position: number, type: "add" | "remove", text: string) => {
    // For web version, we'll handle this if needed
  };

  triggerSelection = () => {
    // Not needed for web version
  };

  openSettings = () => {
    this.onOpenSettings();
  };

  destroy = () => {
    // Cleanup if needed
  };

  isMobile = () => {
    return window.innerWidth <= 768; // Simple mobile detection
  };

  exportAudio = async (text: string, replaceSelection?: boolean) => {
    // Not implemented for web version
  };
}

async function main() {
  const settingsStore = await pluginSettingsStore(
    async () => {
      const loaded = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return loaded ? JSON.parse(loaded) : undefined;
    },
    async (data) => {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data));
    },
  );

  const audioSink = await WebAudioSink.create();

  const system = createAudioSystem({
    settings: () => settingsStore.settings,
    ttsModel: () => {
      return REGISTRY[system.settings.modelProvider];
    },
    storage: () => new IndexedDBAudioStorage(),
    audioSink: () => audioSink,
    audioStore: (sys) => loadAudioStore({ system: sys }),
    chunkLoader: (sys) => new ChunkLoader({ system: sys }),
    config: () => ({
      backgroundLoaderIntervalMillis: 1000,
    }),
  });

  const store = system.audioStore;

  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);

  // Apply dark theme to body
  document.body.style.backgroundColor = THEME.background.primary;
  document.body.style.color = THEME.text.primary;
  document.body.style.margin = "0";
  document.body.style.padding = "0";

  const reactRoot = createRoot(root);
  reactRoot.render(
    <TooltipProvider>
      <App settingsStore={settingsStore} store={store} sink={audioSink} />
    </TooltipProvider>,
  );
}

const App: FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
  sink: WebAudioSink;
}> = ({ settingsStore, store, sink }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [editorView, setEditorView] = useState<EditorView | undefined>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Create obsidian bridge
  const obsidianBridge = useRef<WebObsidianBridge>();
  if (!obsidianBridge.current) {
    obsidianBridge.current = new WebObsidianBridge(store, () =>
      setShowSettings(true),
    );
  }

  // Update active editor when editor view changes
  useEffect(() => {
    obsidianBridge.current?.setActiveEditor(editorView);
  }, [editorView]);

  // Handle modal open/close
  useEffect(() => {
    if (showSettings && dialogRef.current) {
      dialogRef.current.showModal();
    } else if (!showSettings && dialogRef.current) {
      dialogRef.current.close();
    }
  }, [showSettings]);

  const handleCloseModal = useCallback(() => {
    setShowSettings(false);
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: THEME.background.primary,
        color: THEME.text.primary,
      }}
    >
      {/* Command Bar */}
      <CommandBar
        settingsStore={settingsStore}
        store={store}
        sink={sink}
        editor={editorView}
        obsidian={obsidianBridge.current}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Editor store={store} onEditorReady={setEditorView} />
      </div>

      {/* Settings Modal */}
      <dialog
        ref={dialogRef}
        style={{
          padding: 0,
          border: "none",
          borderRadius: "8px",
          backgroundColor: THEME.background.secondary,
          color: THEME.text.primary,
          maxWidth: "800px",
          width: "90vw",
          maxHeight: "80vh",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
        }}
        onClose={handleCloseModal}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: `1px solid ${THEME.border.primary}`,
            backgroundColor: THEME.background.tertiary,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            Settings
          </h2>
          <IconButton
            icon="x"
            tooltip="Close Settings"
            onClick={handleCloseModal}
          />
        </div>

        <div
          style={{
            padding: "20px",
            overflow: "auto",
            maxHeight: "calc(80vh - 60px)",
          }}
        >
          <TTSSettingsTabComponent store={settingsStore} player={store} />
        </div>
      </dialog>
    </div>
  );
};

const CommandBar: React.FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
  sink: WebAudioSink;
  editor: EditorView | undefined;
  obsidian: WebObsidianBridge | undefined;
  onOpenSettings: () => void;
}> = observer(
  ({ settingsStore, store, sink, editor, obsidian, onOpenSettings }) => {
    const handlePlayAll = useCallback(() => {
      if (editor && obsidian) {
        obsidian.playSelection();
      }
    }, [editor, obsidian]);

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: `1px solid ${THEME.border.primary}`,
          backgroundColor: THEME.background.secondary,
          minHeight: "40px",
        }}
      >
        {/* Settings gear icon */}
        <IconButton
          icon="settings"
          tooltip="Settings"
          onClick={onOpenSettings}
        />

        {/* Play all text button */}
        <IconButton
          icon="file-text"
          tooltip="Play All Text"
          onClick={handlePlayAll}
          disabled={!editor}
        />

        {/* Separator */}
        <div
          style={{
            width: "1px",
            height: "20px",
            backgroundColor: THEME.border.primary,
            margin: "0 4px",
          }}
        />

        {/* PlayerView controls when available */}
        {editor && settingsStore && obsidian && (
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <PlayerView
              editor={editor}
              player={store}
              settings={settingsStore}
              sink={sink}
              obsidian={obsidian}
            />
          </div>
        )}
      </div>
    );
  },
);

const Editor: React.FC<{
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

main().catch(console.error);
