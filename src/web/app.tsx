import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import {
  pluginSettingsStore,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";
import { WebAudioSink } from "../player/AudioSink";
import * as React from "react";
import { AudioVisualizer } from "../components/AudioVisualizer";
import { useEffect, useState, type FC, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import { REGISTRY } from "../models/registry";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, ViewUpdate } from "@codemirror/view";
import { TTSSettingsTabComponent } from "../components/TTSSettingsTabComponent";
import { TooltipProvider } from "../util/TooltipContext";

const STORAGE_KEYS = {
  SETTINGS: "tts-settings",
  EDITOR_TEXT: "tts-editor-text",
};

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
  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1>TTS Web App</h1>

      <Settings settingsStore={settingsStore} store={store} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <Editor store={store} />
        <Player store={store} sink={sink} />
      </div>
    </div>
  );
};

const Settings: React.FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
}> = observer(({ settingsStore, store }) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div style={{ marginBottom: "20px" }}>
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          padding: "8px 16px",
          backgroundColor: "#f0f0f0",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {showSettings ? "Hide Settings" : "Show Settings"}
      </button>

      {showSettings && (
        <div
          style={{
            marginTop: "10px",
            padding: "16px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <TTSSettingsTabComponent store={settingsStore} player={store} />
        </div>
      )}
    </div>
  );
});

const Editor: React.FC<{ store: AudioStore }> = ({ store }) => {
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
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  const getCurrentText = useCallback(() => {
    return editorViewRef.current?.state.doc.toString() || "";
  }, []);

  const handlePlaySelection = useCallback(() => {
    const text = getCurrentText();
    if (!text.trim()) return;

    store.startPlayer({
      filename: "editor.md",
      text,
      start: 0,
      end: text.length,
    });
  }, [store, getCurrentText]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ margin: 0 }}>Text Editor</h3>
        <button
          onClick={handlePlaySelection}
          style={{
            padding: "8px 16px",
            backgroundColor: "#007acc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Play All Text
        </button>
      </div>

      <div
        ref={editorRef}
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          minHeight: "400px",
        }}
      />
    </div>
  );
};

const Player: React.FC<{ store: AudioStore; sink: WebAudioSink }> = observer(
  ({ store, sink }) => {
    return (
      <div
        style={{
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "4px",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Player Controls</h3>

        <div style={{ marginBottom: "16px" }}>
          <button
            onClick={() => {
              if (store.activeText?.isPlaying) {
                store.activeText.pause();
              } else if (store.activeText) {
                store.activeText.play();
              }
            }}
            disabled={!store.activeText}
            style={{
              padding: "12px 24px",
              backgroundColor: store.activeText?.isPlaying
                ? "#dc3545"
                : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: store.activeText ? "pointer" : "not-allowed",
              width: "100%",
              fontSize: "16px",
            }}
          >
            {store.activeText?.isPlaying ? "Pause" : "Play"}
          </button>
        </div>

        {store.activeText && (
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}
            >
              Status: {store.activeText.isPlaying ? "Playing" : "Paused"}
            </div>

            {store.activeText.currentChunk && (
              <div style={{ fontSize: "12px", color: "#888" }}>
                Chunk {store.activeText.position + 1} of{" "}
                {store.activeText.audio.chunks.length}
              </div>
            )}
          </div>
        )}

        {store.activeText?.currentChunk?.audioBuffer && (
          <div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>
              Audio Visualizer:
            </div>
            <AudioVisualizer
              audioElement={sink.audio}
              audioBuffer={store.activeText.currentChunk.audioBuffer}
              offsetDurationSeconds={
                store.activeText.currentChunk.offsetDuration!
              }
            />
          </div>
        )}
      </div>
    );
  },
);

main().catch(console.error);
