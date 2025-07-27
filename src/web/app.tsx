import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "../player/AudioStore";
import {
  pluginSettingsStore,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";
import { WebAudioSink } from "../player/AudioSink";
import * as React from "react";
import { useEffect, useState, type FC, useRef } from "react";
import { createAudioSystem } from "../player/AudioSystem";
import { ChunkLoader } from "../player/ChunkLoader";
import { REGISTRY } from "../models/registry";
import { EditorView } from "@codemirror/view";
import { TooltipProvider } from "../util/TooltipContext";
import { CommandBar, WebObsidianBridge } from "./components/CommandBar";
import { WebEditor } from "./components/WebEditor";
import { SettingsModal } from "./components/SettingsModal";

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
class WebObsidianBridgeImpl implements WebObsidianBridge {
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

  // Create obsidian bridge
  const obsidianBridge = useRef<WebObsidianBridge>();
  if (!obsidianBridge.current) {
    obsidianBridge.current = new WebObsidianBridgeImpl(store, () =>
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
        <WebEditor store={store} onEditorReady={setEditorView} />
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
