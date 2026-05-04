import { MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { autorun, IReactionDisposer } from "mobx";
import { AudioStore } from "open-tts";
import { AudioSink } from "open-tts";
import { TTSPluginSettingsStore } from "open-tts";
import { ObsidianBridge } from "./ObsidianBridge";
import { TTSActions, createTTSActions } from "open-tts";
import { EditorActionIcon } from "@open-tts/ui";
import { TTSControlMenuContent } from "./components/TTSControlMenu";

const EDITOR_ACTION_ATTR = "data-aloud-action";

type SinkWithElement = AudioSink & { audioElement?: HTMLAudioElement };

interface ActionButtonState {
  root: Root;
  disposer: IReactionDisposer;
}

/**
 * Manages the editor action button.
 *
 * Behavior differs by platform:
 * - Desktop/tablets: Static icon, click always plays selection
 * - Mobile phones: Visualizer when playing, menu on click when active
 */
export class TTSEditorAction {
  private actions: TTSActions;
  private leafStates = new Map<WorkspaceLeaf, ActionButtonState>();
  private menuRoot: Root | null = null;
  private menuContainer: HTMLElement | null = null;

  constructor(
    private plugin: Plugin,
    private player: AudioStore,
    private settings: TTSPluginSettingsStore,
    private bridge: ObsidianBridge,
    private sink: AudioSink,
  ) {
    this.actions = createTTSActions(player, settings, bridge);
  }

  private get isMobilePhone(): boolean {
    return isMobilePhone(this.bridge);
  }

  /**
   * Register the editor action button handlers.
   * Should be called during plugin onload().
   */
  register(): void {
    // Add to newly opened leaves
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
        if (this.settings.settings.showEditorActionButton) {
          this.addToLeaf(leaf);
        }
        this.pruneLeafStates();
      }),
    );

    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.pruneLeafStates();
      }),
    );

    // React to setting changes
    const settingDisposer = autorun(() => {
      const show = this.settings.settings.showEditorActionButton;
      if (show) {
        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
          this.addToLeaf(leaf);
        });
      } else {
        this.removeAllButtons();
      }
    });
    this.plugin.register(() => settingDisposer());

    // Add to all existing leaves (autorun above handles the initial add,
    // but we still need the event handlers registered first)
  }

  /**
   * Clean up all action buttons.
   * Should be called during plugin onunload().
   */
  destroy(): void {
    this.closeMenu();
    for (const [, state] of this.leafStates) {
      state.disposer();
      state.root.unmount();
    }
    this.leafStates.clear();
  }

  private removeAllButtons(): void {
    this.closeMenu();
    for (const [leaf, state] of this.leafStates) {
      this.disposeLeafState(leaf, state);
    }
    // Remove any action buttons that aren't tracked in leafStates (desktop)
    document
      .querySelectorAll(`[${EDITOR_ACTION_ATTR}="1"]`)
      .forEach((el) => el.remove());
  }

  private addToLeaf(leaf: WorkspaceLeaf | null): void {
    const view = leaf?.view;
    if (!(view instanceof MarkdownView)) return;

    // Prevent duplicates (leaf can be re-used)
    const container = view.containerEl as HTMLElement;
    const existing = container.querySelector(`[${EDITOR_ACTION_ATTR}="1"]`);
    if (existing) {
      existing.remove();
    }

    // Create action button
    const action = view.addAction("audio-lines", "Aloud TTS", (evt) => {
      this.handleClick(evt);
    });
    action.setAttr(EDITOR_ACTION_ATTR, "1");

    // On mobile phones, mount React for reactive visualizer icon
    // On desktop/tablets, keep the default static icon
    if (this.isMobilePhone) {
      const { root, disposer } = this.mountReactIcon(action);

      // Store state for cleanup
      if (leaf) {
        this.leafStates.set(leaf, { root, disposer });
      }
    }
  }

  private mountReactIcon(actionButton: HTMLElement): {
    root: Root;
    disposer: IReactionDisposer;
  } {
    // Clear default icon content
    actionButton.empty();

    // Create React root
    const root = createRoot(actionButton);

    // Use MobX autorun to re-render on state changes
    const disposer = autorun(() => {
      root.render(
        React.createElement(EditorActionIcon, {
          player: this.player,
          audioElement: (this.sink as SinkWithElement).audioElement,
        }),
      );
    });

    return { root, disposer };
  }

  private handleClick(evt: MouseEvent): void {
    // Stop propagation to prevent immediate close of menu
    evt.stopPropagation();
    evt.preventDefault();

    // Desktop/tablets: always just play selection (like old ribbon icon)
    if (!this.isMobilePhone) {
      this.actions.playSelection();
      return;
    }

    // Mobile phones: play if idle, show menu if active
    if (!this.player.activeText) {
      this.actions.playSelection();
      return;
    }

    // If playing, show control menu
    this.showMenu(evt);
  }

  private showMenu(_evt: MouseEvent): void {
    // Close any existing menu
    this.closeMenu();

    // Create backdrop like Obsidian does
    const backdrop = document.createElement("div");
    backdrop.addClass("suggestion-bg");
    backdrop.style.opacity = "0.85";
    backdrop.addEventListener("click", () => this.closeMenu());
    document.body.appendChild(backdrop);

    // Create the menu container - no positioning, let Obsidian CSS handle it
    this.menuContainer = document.createElement("div");
    this.menuContainer.addClass("menu");
    document.body.appendChild(this.menuContainer);

    // Store backdrop for cleanup
    (this.menuContainer as any)._backdrop = backdrop;

    // Mount the React menu content (without outer .menu wrapper since container already has it)
    this.menuRoot = createRoot(this.menuContainer);
    this.menuRoot.render(
      React.createElement(TTSControlMenuContent, {
        actions: this.actions,
        player: this.player,
        settings: this.settings,
        onClose: () => this.closeMenu(),
      }),
    );
  }

  private closeMenu(): void {
    if (this.menuRoot) {
      this.menuRoot.unmount();
      this.menuRoot = null;
    }
    if (this.menuContainer) {
      // Remove backdrop if it exists
      const backdrop = (this.menuContainer as any)._backdrop as HTMLElement;
      backdrop?.remove();
      this.menuContainer.remove();
      this.menuContainer = null;
    }
  }

  private pruneLeafStates(): void {
    for (const [leaf, state] of this.leafStates) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        this.disposeLeafState(leaf, state);
        continue;
      }
      const isConnected = view.containerEl?.isConnected;
      if (!isConnected) {
        this.disposeLeafState(leaf, state);
      }
    }
  }

  private disposeLeafState(
    leaf: WorkspaceLeaf,
    state: ActionButtonState,
  ): void {
    state.disposer();
    state.root.unmount();
    this.leafStates.delete(leaf);
  }
}

/**
 * Check if the current device is a mobile phone (not tablet).
 * Mobile phone is detected when BOTH conditions are true:
 * - app.isMobile === true
 * - window.innerWidth < 600
 */
export function isMobilePhone(bridge: ObsidianBridge): boolean {
  return bridge.isMobile() && window.innerWidth < 600;
}
