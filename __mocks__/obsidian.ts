import { vi } from "vitest";

export const setIcon = vi.fn();
export const setTooltip = vi.fn();
export const requestUrl = vi.fn();
export const debounce = vi.fn((fn: Function) => fn);
export const isMobile = vi.fn(() => false);

// Mock Notice class
export class Notice {
  constructor(message: string, timeout?: number) {}
}

// Mock Editor class
export class Editor {
  getCursor() {
    return { line: 0, ch: 0 };
  }
  getRange() {
    return "";
  }
  offsetToPos(offset: number) {
    return { line: 0, ch: offset };
  }
  scrollIntoView() {}
}

// Mock TFile class
export class TFile {
  path: string = "";
  name: string = "";
}

// Mock MarkdownView and related interfaces
export class MarkdownView {
  editor: Editor = new Editor();
}

export interface MarkdownFileInfo {
  editor: Editor;
}

// Export types
export type EditorView = any;

// Mock Plugin class
export class Plugin {
  app: any;
  manifest: any;

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  onload() {}
  onunload() {}
  addCommand() {}
  addRibbonIcon() {}
  addSettingTab() {}
  loadData() {
    return Promise.resolve({});
  }
  saveData() {
    return Promise.resolve();
  }
}

// Mock PluginSettingTab
export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = {
    empty: vi.fn(),
    createEl: vi.fn(() => ({ setText: vi.fn() })),
  };

  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }

  display() {}
  hide() {}
}

// Mock App
export class App {
  workspace: any = {};
  vault: any = {};
  metadataCache: any = {};
}

export interface TooltipOptions {
  delay?: number;
  placement?: string;
}
