import * as mobx from "mobx";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { App, MarkdownView } from "obsidian";
import { AudioSink, AudioStore, TTSPluginSettingsStore } from "open-tts";
import { PlayerView, RenderedHighlighter } from "@open-tts/ui";
import { ObsidianBridge } from "../ObsidianBridge";
import { ObsidianTooltipProvider } from "../util/ObsidianTooltipService";
import { findReadingRoot, isReadingView } from "./readingSections";

const IDLE_POLL_MILLIS = 250;

type SinkWithElement = AudioSink & { audioElement?: HTMLAudioElement };

interface MountedPlayer {
  container: HTMLElement;
  root: Root;
}

/**
 * Reading View support: a player at the top of each reading view, and
 * sentence and word highlighting in the rendered note while it plays.
 */
export class ReadingViewSupport {
  private players = new Map<MarkdownView, MountedPlayer>();
  private highlighter: RenderedHighlighter;
  /** bumped on layout and leaf changes so players re-check whether to show */
  private layoutVersion = mobx.observable.box(0);
  private frame: number | undefined;
  private timer: number | undefined;
  private destroyed = false;

  constructor(
    private app: App,
    private player: AudioStore,
    private settings: TTSPluginSettingsStore,
    private sink: AudioSink,
    private bridge: ObsidianBridge,
  ) {
    this.highlighter = new RenderedHighlighter(
      player,
      sink,
      settings.settings,
      (chunk) => {
        const view = this.activeReadingView();
        return view && this.isPlayingFrom(view)
          ? findReadingRoot(view, chunk, view.data)
          : null;
      },
    );
    this.app.workspace.on("layout-change", this.onLayoutChange);
    this.app.workspace.on("active-leaf-change", this.onLayoutChange);
    this.onLayoutChange();
    this.timer = window.setTimeout(this.tick, 0);
  }

  destroy(): void {
    this.destroyed = true;
    this.app.workspace.off("layout-change", this.onLayoutChange);
    this.app.workspace.off("active-leaf-change", this.onLayoutChange);
    if (this.frame !== undefined) window.cancelAnimationFrame(this.frame);
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.highlighter.clear();
    for (const { container, root } of this.players.values()) {
      root.unmount();
      container.remove();
    }
    this.players.clear();
  }

  private activeReadingView(): MarkdownView | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return isReadingView(view) ? view : null;
  }

  /** Whether the playing text came from this view's note */
  private isPlayingFrom(view: MarkdownView): boolean {
    const filename = this.player.activeText?.audio.filename;
    return !!filename && !!view.file && filename.startsWith(view.file.path);
  }

  private tick = (): void => {
    this.frame = undefined;
    this.timer = undefined;
    if (this.destroyed) {
      return;
    }
    this.highlighter.update();
    if (this.sink.isPlaying) {
      this.frame = window.requestAnimationFrame(this.tick);
    } else {
      this.timer = window.setTimeout(this.tick, IDLE_POLL_MILLIS);
    }
  };

  private onLayoutChange = (): void => {
    const views = new Set(
      this.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .filter((view): view is MarkdownView => view instanceof MarkdownView),
    );
    for (const [view, mounted] of this.players) {
      if (!views.has(view) || !mounted.container.isConnected) {
        mounted.root.unmount();
        mounted.container.remove();
        this.players.delete(view);
      }
    }
    for (const view of views) {
      if (!this.players.has(view)) {
        this.mountPlayer(view);
      }
    }
    mobx.runInAction(() =>
      this.layoutVersion.set(this.layoutVersion.get() + 1),
    );
  };

  private shouldShow(view: MarkdownView): boolean {
    this.layoutVersion.get();
    const isActive =
      isReadingView(view) &&
      this.app.workspace.getActiveViewOfType(MarkdownView) === view;
    const hasText = !!this.player.activeText && this.isPlayingFrom(view);
    switch (this.settings.settings.showPlayerView) {
      case "always":
        return isActive;
      case "never":
        return false;
      case "always-mobile":
        return this.bridge.isMobile() ? isActive : isActive && hasText;
      case "playing":
        return isActive && hasText;
    }
  }

  private mountPlayer(view: MarkdownView): void {
    const readingEl = view.previewMode.containerEl;
    const container = readingEl.createDiv({
      cls: ["tts-toolbar", "tts-reading-toolbar"],
    });
    readingEl.prepend(container);
    const root = createRoot(container);
    root.render(
      React.createElement(ObsidianTooltipProvider, {
        children: React.createElement(PlayerView, {
          player: this.player,
          settings: this.settings,
          sink: this.sink,
          shouldShow: () => this.shouldShow(view),
          isMobilePhone: () =>
            this.bridge.isMobile() && window.innerWidth < 600,
          audioElement: (this.sink as SinkWithElement).audioElement,
          onOpenSettings: () => this.bridge.openSettings(),
          onPlaySelection: () => this.bridge.playSelection(),
          onSaveDocumentAudio: () => {
            this.bridge.saveDocumentAudio().catch((ex) => {
              console.error("Couldn't save document audio!", ex);
            });
          },
        }),
      }),
    );
    this.players.set(view, { container, root });
  }
}
