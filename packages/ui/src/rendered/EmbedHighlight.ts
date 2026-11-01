import { Extension } from "@codemirror/state";
import { EditorView, PluginValue, ViewPlugin } from "@codemirror/view";
import {
  AudioSink,
  AudioStore,
  AudioTextChunk,
  TTSPluginSettings,
} from "open-tts";
import { RenderedHighlighter } from "./RenderedHighlighter";

const IDLE_POLL_MILLIS = 250;

/** The rendered embed widget in the editor that a chunk's text comes from */
function findEmbedContent(
  view: EditorView,
  chunk: AudioTextChunk,
): Element | null {
  const embeds = view.contentDOM.querySelectorAll(".internal-embed");
  for (const embed of Array.from(embeds)) {
    // nested embeds are found inside their outermost embed
    if (embed.parentElement?.closest(".internal-embed")) {
      continue;
    }
    let position: number;
    try {
      position = view.posAtDOM(embed);
    } catch {
      continue;
    }
    if (position >= chunk.start && position < chunk.end) {
      return embed.querySelector(".markdown-embed-content") ?? embed;
    }
  }
  return null;
}

/**
 * Highlights the sentence and word being read from an ![[embed]] inside the
 * embed's rendered content, which editor decorations can't reach.
 */
export function createEmbedHighlightExtension(
  player: AudioStore,
  sink: AudioSink,
  settings: TTSPluginSettings,
  getActiveEditor: () => EditorView | undefined,
): Extension {
  return ViewPlugin.define((view): PluginValue => {
    const highlighter = new RenderedHighlighter(
      player,
      sink,
      settings,
      (chunk) =>
        // a hidden editor (e.g. behind Reading View) has no visible embeds to mark
        chunk.embedded &&
        getActiveEditor() === view &&
        view.dom.isConnected &&
        view.dom.offsetParent !== null
          ? findEmbedContent(view, chunk)
          : null,
    );
    // timers run on the editor's own window, which may be a pop-out
    const win = view.dom.ownerDocument.defaultView ?? window;
    let frame: number | undefined;
    let timer: number | undefined;
    let destroyed = false;
    const tick = () => {
      frame = undefined;
      timer = undefined;
      if (destroyed) {
        return;
      }
      highlighter.update();
      if (sink.isPlaying) {
        frame = win.requestAnimationFrame(tick);
      } else {
        timer = win.setTimeout(tick, IDLE_POLL_MILLIS);
      }
    };
    timer = win.setTimeout(tick, 0);
    return {
      destroy() {
        destroyed = true;
        if (frame !== undefined) win.cancelAnimationFrame(frame);
        if (timer !== undefined) win.clearTimeout(timer);
        highlighter.clear();
      },
    };
  });
}
