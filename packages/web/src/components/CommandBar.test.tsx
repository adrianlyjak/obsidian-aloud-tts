import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { EditorView } from "@codemirror/view";
import { AudioStore, TTSPluginSettingsStore } from "open-tts";
import { WebAudioSink } from "open-tts/browser";
import { CommandBar } from "./CommandBar";
import { WebObsidianBridge } from "./WebBridge";

function createEditor(text: string, from: number, to: number): EditorView {
  return {
    state: {
      selection: {
        main: { from, to, head: to },
      },
      doc: {
        length: text.length,
        sliceString: (start: number, end: number) => text.slice(start, end),
        toString: () => text,
      },
    },
  } as unknown as EditorView;
}

function createSettingsStore(): TTSPluginSettingsStore {
  return {
    settings: {
      showPlayerView: "never",
      playbackSpeed: 1,
    },
    setSpeed: vi.fn(),
    updateSettings: vi.fn(),
  } as unknown as TTSPluginSettingsStore;
}

function createAudioStore(exportRunning = false): AudioStore {
  return {
    activeText: null,
    autoScrollEnabled: true,
    exportProgress: exportRunning ? { completed: 0, total: 1 } : null,
    destroy: vi.fn(),
    cancelExport: vi.fn(),
  } as unknown as AudioStore;
}

function createSink(): WebAudioSink {
  return {
    trackStatus: "paused",
  } as unknown as WebAudioSink;
}

function createBridge(editor: EditorView): WebObsidianBridge {
  return {
    activeEditor: editor,
    focusedEditor: editor,
    detachedAudio: false,
    triggerSelection: vi.fn(),
    playSelection: vi.fn(),
    playDetached: vi.fn(),
    onTextChanged: vi.fn(),
    openSettings: vi.fn(),
    destroy: vi.fn(),
    isMobile: vi.fn(() => false),
    setActiveEditor: vi.fn(),
    exportAudio: vi.fn(() => Promise.resolve()),
    saveDocumentAudio: vi.fn(() => Promise.resolve()),
  };
}

describe("CommandBar", () => {
  it("moves export selection behind the overflow menu", () => {
    const editor = createEditor("Hello world", 0, 5);
    const obsidian = createBridge(editor);

    render(
      <CommandBar
        settingsStore={createSettingsStore()}
        store={createAudioStore()}
        sink={createSink()}
        editor={editor}
        obsidian={obsidian}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Export Selection to Audio" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export selection as audio..." }),
    );

    expect(obsidian.exportAudio).toHaveBeenCalledWith("Hello", false);
  });

  it("disables selection export when there is no selected text", () => {
    const editor = createEditor("Hello world", 0, 0);

    render(
      <CommandBar
        settingsStore={createSettingsStore()}
        store={createAudioStore()}
        sink={createSink()}
        editor={editor}
        obsidian={createBridge(editor)}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Export selection as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("disables export actions while an export is running", () => {
    const editor = createEditor("Hello world", 0, 5);

    render(
      <CommandBar
        settingsStore={createSettingsStore()}
        store={createAudioStore(true)}
        sink={createSink()}
        editor={editor}
        obsidian={createBridge(editor)}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Export selection as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("menuitem", {
          name: "Save document as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
