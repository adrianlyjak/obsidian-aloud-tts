import { EditorView } from "@codemirror/view";

export interface ObsidianBridge {
  currentCodeMirror: () => EditorView | undefined;
  playSelection: () => void;
  openSettings: () => void;
}
