import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "open-tts";
import { pluginSettingsStore, TTSPluginSettingsStore } from "open-tts";
import { IndexedDBAudioStorage } from "open-tts/browser";
import { WebAudioSink } from "open-tts/browser";
import * as React from "react";
import { useEffect, useState, type FC, useRef } from "react";
import { createAudioSystem } from "open-tts";
import { ChunkLoader } from "open-tts";
import { REGISTRY } from "open-tts";
import { EditorView } from "@codemirror/view";
import { TooltipProvider } from "@open-tts/ui";
import { CommandBar } from "./components/CommandBar";
import { WebEditor } from "./components/WebEditor";
import { SettingsModal } from "./components/SettingsModal";
import { WebBridgeImpl, WebObsidianBridge } from "./components/WebBridge";
import "../../obsidian/styles.css";
import "./web-styles.css";

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
  const [showSettings, setShowSettings] = useState(false);
  const [editorView, setEditorView] = useState<EditorView | undefined>();

  // Create obsidian bridge
  const obsidianBridge = useRef<WebObsidianBridge>();
  if (!obsidianBridge.current) {
    obsidianBridge.current = new WebBridgeImpl(store, () =>
      setShowSettings(true),
    );
  }

  // Update active editor when editor view changes
  useEffect(() => {
    obsidianBridge.current?.setActiveEditor(editorView);
  }, [editorView]);

  const handleCloseModal = () => {
    setShowSettings(false);
  };

  return (
    <div className="web-tts-app-root">
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
        <WebEditor
          store={store}
          onEditorReady={setEditorView}
          bridge={obsidianBridge.current}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={handleCloseModal}
        settingsStore={settingsStore}
        audioStore={store}
      />
    </div>
  );
};

main().catch(console.error);
