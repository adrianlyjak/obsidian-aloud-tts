// Simple no-op function that can be used as a mock
const noop = (): void => {};

export const setIcon = noop;
export const setTooltip = noop;
export const requestUrl = noop;
export const debounce = <T extends (...args: unknown[]) => unknown>(fn: T): T =>
  fn;
export const isMobile = (): boolean => false;

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
    empty: noop,
    createEl: () => ({ setText: noop }),
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

// Mock Platform
export const Platform = {
  isDesktopApp: false,
  isMobileApp: false,
  isMobile: false,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: false,
  isWin: false,
  isLinux: false,
  isSafari: false,
};
