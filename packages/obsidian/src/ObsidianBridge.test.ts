import { describe, it, expect, vi } from "vitest";
import { FileView, loadPdfJs, Notice } from "obsidian";
import { ObsidianBridgeImpl } from "./ObsidianBridge";
import { createTestAudioStore, createTestSettingsStore } from "./test-utils";

function stubActiveSelection(text: string, root?: HTMLElement): void {
  const selectionNode = root?.firstChild || root || document.body;
  vi.stubGlobal("activeWindow", {
    getSelection: () => ({
      toString: () => text,
      rangeCount: text ? 1 : 0,
      anchorNode: selectionNode,
      focusNode: selectionNode,
      getRangeAt: () => ({ commonAncestorContainer: selectionNode }),
    }),
  });
}

function mockPdfJsText(text: string): { destroy: ReturnType<typeof vi.fn> } {
  const destroy = vi.fn();
  vi.mocked(loadPdfJs).mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getTextContent: () =>
              Promise.resolve({
                items: text.split(" ").map((str) => ({ str })),
              }),
          }),
        destroy,
      }),
    }),
  });
  return { destroy };
}

// Mock React and DOM utilities
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("./components/ObsidianIsPlaying", () => ({
  IsPlaying: () => null,
}));

vi.mock("obsidian", () => ({
  App: vi.fn(),
  Notice: vi.fn(),
  MarkdownView: vi.fn(),
  FileView: class MockFileView {
    file: unknown;
    containerEl?: HTMLElement;
    contentEl?: HTMLElement;
    constructor(file: unknown, containerEl?: HTMLElement) {
      this.file = file;
      this.containerEl = containerEl;
      this.contentEl = containerEl;
    }
    getViewType(): string {
      return "pdf";
    }
  },
  TFile: vi.fn(),
  Modal: vi.fn(),
  Setting: vi.fn(),
  loadPdfJs: vi.fn(),
}));

describe("ObsidianBridge", () => {
  describe("ObsidianBridgeImpl", () => {
    it("should instantiate without crashing", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      expect(bridge).toBeDefined();
      expect(bridge).toBeInstanceOf(ObsidianBridgeImpl);
    });

    it("should have required interface methods", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      // Check interface methods exist
      expect(typeof bridge.playSelection).toBe("function");
      expect(typeof bridge.playDetached).toBe("function");
      expect(typeof bridge.onTextChanged).toBe("function");
      expect(typeof bridge.exportAudio).toBe("function");
    });

    it("should have observable properties", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      // Check observable properties exist (they may be undefined initially)
      expect(bridge.activeEditor).toBeUndefined(); // No active editor initially
      expect(bridge.focusedEditor).toBeUndefined(); // No focused editor initially
      expect(typeof bridge.detachedAudio).toBe("boolean");
    });

    it("should play selected PDF text from the active PDF view", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      containerEl.textContent = "selected PDF text";
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;
      stubActiveSelection("selected PDF text", containerEl);

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();

      expect(startPlayer).toHaveBeenCalledWith({
        filename: "sample.pdf",
        text: "selected PDF text",
        start: 0,
        end: 17,
      });
    });

    it("should ignore stale selections outside the active PDF view", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      containerEl.textContent = "PDF text";
      const outsideSelection = document.createElement("div");
      outsideSelection.textContent = "sidebar text";
      document.body.append(outsideSelection);
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
        },
      } as any;
      const { destroy } = mockPdfJsText("Full PDF text");
      stubActiveSelection("sidebar text", outsideSelection);

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "Full PDF text",
          start: 0,
          end: 13,
        });
      });

      expect(destroy).toHaveBeenCalled();
    });

    it("should load full PDF text instead of partial mounted text", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      const firstLayer = document.createElement("div");
      const secondLayer = document.createElement("div");
      firstLayer.className = "textLayer";
      secondLayer.className = "textLayer";
      firstLayer.textContent = "Mounted PDF text";
      secondLayer.textContent = "second page";
      containerEl.append(firstLayer, secondLayer);
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(),
        },
      } as any;
      const { destroy } = mockPdfJsText("Complete PDF text");
      stubActiveSelection("");

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "Complete PDF text",
          start: 0,
          end: 17,
        });
      });

      expect(mockApp.vault.readBinary).toHaveBeenCalledWith(file);
      expect(destroy).toHaveBeenCalled();
    });

    it("should load the full PDF text when no PDF text is selected", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const PdfView = FileView as unknown as new (file: unknown) => FileView;
      const destroy = vi.fn();
      vi.mocked(loadPdfJs).mockResolvedValue({
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPage: (pageNumber: number) =>
              Promise.resolve({
                getTextContent: () =>
                  Promise.resolve({
                    items:
                      pageNumber === 1
                        ? [{ str: "First" }, { str: "page" }]
                        : [{ str: "Second", hasEOL: true }, { str: "page" }],
                  }),
              }),
            destroy,
          }),
        }),
      });
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
        },
      } as any;
      stubActiveSelection("");

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "First page\n\nSecond\npage",
          start: 0,
          end: 23,
        });
      });

      expect(mockApp.vault.readBinary).toHaveBeenCalledWith(file);
      expect(destroy).toHaveBeenCalled();
    });

    describe("hasOtherTextInFocus", () => {
      function noteView(path: string) {
        const text = `Text of ${path}.`;
        const editor = {
          cm: {},
          getCursor: () => ({ line: 0, ch: 0 }),
          lastLine: () => 0,
          getLine: () => text,
          getRange: (from: { ch: number }, to: { ch: number }) =>
            text.slice(from.ch, to.ch),
        };
        return {
          editor,
          file: { path, name: path },
          getViewType: () => "markdown",
        };
      }

      async function setup() {
        const mockApp = {
          workspace: {
            activeLeaf: null as unknown,
            activeEditor: null as unknown,
            on: vi.fn(),
            off: vi.fn(),
            getActiveViewOfType: vi.fn((): unknown => null),
          },
          vault: {
            on: vi.fn(),
            off: vi.fn(),
            readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
          },
        } as any;
        const onLeafChange = () =>
          mockApp.workspace.on.mock.calls
            .filter(([name]: [string]) => name === "active-leaf-change")
            .forEach(([, handler]: [string, () => void]) => handler());
        const focus = (view: { getViewType(): string }) => {
          mockApp.workspace.activeLeaf = { view };
          const isNote = view.getViewType() === "markdown";
          mockApp.workspace.activeEditor = isNote ? view : null;
          mockApp.workspace.getActiveViewOfType = vi.fn(() =>
            isNote ? view : null,
          );
          onLeafChange();
        };
        const audioStore = createTestAudioStore();
        const settingsStore = await createTestSettingsStore();
        const bridge = new ObsidianBridgeImpl(
          mockApp,
          audioStore,
          settingsStore,
        );
        return { bridge, audioStore, focus };
      }

      it("is false on the note that's loaded and true on another note", async () => {
        const { bridge, focus } = await setup();
        const first = noteView("first.md");
        const second = noteView("second.md");

        focus(first);
        bridge.triggerSelection(first.file as any, first.editor as any);
        expect(bridge.hasOtherTextInFocus()).toBe(false);

        focus(second);
        expect(bridge.hasOtherTextInFocus()).toBe(true);
      });

      it("is false on the PDF that's loaded and true on a note", async () => {
        const { bridge, audioStore, focus } = await setup();
        const PdfView = FileView as unknown as new (file: unknown) => FileView;
        const pdf = new PdfView({ path: "sample.pdf", name: "sample.pdf" });
        mockPdfJsText("PDF text.");
        stubActiveSelection("");

        focus(pdf);
        bridge.playSelection();
        await vi.waitFor(() => expect(audioStore.activeText).toBeTruthy());
        expect(bridge.hasOtherTextInFocus()).toBe(false);

        focus(noteView("note.md"));
        expect(bridge.hasOtherTextInFocus()).toBe(true);
      });
    });

    it("should show a notice when the active PDF view has no file", async () => {
      const PdfView = FileView as unknown as new (file: unknown) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(null) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();

      expect(startPlayer).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith("No PDF file to play");
    });

    it("should reset detached playback when starting audio fails", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      vi.spyOn(audioStore, "startPlayer").mockRejectedValue(
        new Error("audio failed"),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playDetached("Detached text", "detached.txt");
      expect(bridge.detachedAudio).toBe(true);

      await vi.waitFor(() => {
        expect(bridge.detachedAudio).toBe(false);
      });
      expect(Notice).toHaveBeenCalledWith("Failed to start audio");
    });

    it("should show a notice instead of playing empty clipboard text", async () => {
      vi.stubGlobal("navigator", {
        clipboard: { readText: () => Promise.resolve("   ") },
      });
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      await bridge.playClipboard();

      expect(startPlayer).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith("No text found in clipboard");
    });
  });
});
