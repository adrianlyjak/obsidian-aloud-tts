import { EditorView } from "@codemirror/view";
import { AudioStore } from "../../player/AudioStore";
import { TTSEditorBridge } from "../../codemirror/TTSCodeMirrorCore";

export interface WebObsidianBridge extends TTSEditorBridge {
  setActiveEditor: (editor: EditorView | undefined) => void;
  triggerSelection: () => void;
}

export class WebBridgeImpl implements WebObsidianBridge {
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

  // Play selection if exists, otherwise play from cursor to end
  playSelection = () => {
    this.triggerSelection();
  };

  triggerSelection = () => {
    if (!this.activeEditor) return;

    const state = this.activeEditor.state;
    const selection = state.selection.main;
    const doc = state.doc;

    let start: number;
    let end: number;
    let text: string;

    // Check if there's a real selection (not just cursor)
    if (selection.from !== selection.to) {
      // Play the selection
      start = selection.from;
      end = selection.to;
      text = doc.sliceString(start, end);
    } else {
      // No selection, play from cursor to end
      start = selection.head;
      end = doc.length;
      text = doc.sliceString(start, end);
    }

    if (text.trim()) {
      this.store.startPlayer({
        filename: "editor.md",
        text,
        start,
        end,
      });
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
    if (!text.trim()) {
      alert("No text to export");
      return;
    }

    try {
      // Generate audio using the audio store
      const audioData = await this.store.exportAudio(text);

      // Create a blob and download it
      const blob = new Blob([audioData], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      // Create filename
      const hash = this.hashString(text).toString(16).slice(0, 8);
      const prefix = text
        .replace(/\s/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 20)
        .replace(/-+$/, "");
      const filename = `${prefix}-${hash}.mp3`;

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`Exported ${filename}`);
    } catch (ex) {
      console.error("Couldn't export audio!", ex);
      alert("Failed to export audio");
    }
  };

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
