import { Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
} from "@codemirror/view";
import * as mobx from "mobx";
import {
  AudioSink,
  AudioStore,
  AudioTextChunk,
  TimedWordRange,
  TTSPluginSettings,
  WordTiming,
  estimateWordTimings,
  findWordIndexAt,
  mapTimingsToRawText,
} from "open-tts";

export interface WordHighlightRange {
  from: number;
  to: number;
  /** how long the word is spoken for, in wall-clock seconds */
  durationSeconds: number;
}

const DEFAULT_WORD_COLOR = "rgb(168, 85, 247)";
const IDLE_POLL_MILLIS = 250;

export const setWordHighlight = StateEffect.define<WordHighlightRange | null>();

function createWordHighlightField(
  settings: TTSPluginSettings,
): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(value, tr): DecorationSet {
      let next = tr.docChanged ? value.map(tr.changes) : value;
      for (const effect of tr.effects) {
        if (!effect.is(setWordHighlight)) {
          continue;
        }
        const range = effect.value;
        if (!range || range.from >= range.to) {
          next = Decoration.none;
          continue;
        }
        const duration = Math.min(Math.max(range.durationSeconds, 0.08), 0.6);
        next = Decoration.set([
          Decoration.mark({
            class: `tts-cm-word-now tts-word-anim-${settings.highlightWordAnimation}`,
            attributes: {
              style: `--tts-word-duration: ${duration.toFixed(3)}s`,
            },
          }).range(range.from, range.to),
        ]);
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

interface CachedWords {
  rawText: string;
  timings: WordTiming[] | undefined;
  duration: number | undefined;
  words: TimedWordRange[];
}

const wordCache = new WeakMap<AudioTextChunk, CachedWords>();

/** Returns the chunk's words with timings, preferring provider alignment over estimates */
function getTimedWords(chunk: AudioTextChunk): TimedWordRange[] {
  const cached = wordCache.get(chunk);
  const providerTimings = chunk.audio?.wordTimings;
  if (
    cached &&
    cached.rawText === chunk.rawText &&
    cached.duration === chunk.duration &&
    (cached.timings === providerTimings || !chunk.audio)
  ) {
    return cached.words;
  }
  const timings =
    providerTimings ??
    (chunk.duration ? estimateWordTimings(chunk.text, chunk.duration) : []);
  const words = mapTimingsToRawText(chunk.rawText, timings);
  wordCache.set(chunk, {
    rawText: chunk.rawText,
    timings: providerTimings,
    duration: chunk.duration,
    words,
  });
  return words;
}

export function computeWordHighlight(
  player: AudioStore,
  sink: AudioSink,
  playbackSpeed: number,
): WordHighlightRange | null {
  const chunk = player.activeText?.currentChunk;
  if (!chunk || chunk.timelineStartSeconds == null) {
    return null;
  }
  const time = sink.currentTime - chunk.timelineStartSeconds;
  if (time < 0) {
    return null;
  }
  const words = getTimedWords(chunk);
  const index = findWordIndexAt(words, time);
  if (index < 0) {
    return null;
  }
  const word = words[index];
  return {
    from: chunk.start + word.from,
    to: chunk.start + word.to,
    durationSeconds: (word.end - word.start) / (playbackSpeed || 1),
  };
}

function applyHighlightColors(
  dom: HTMLElement,
  settings: TTSPluginSettings,
): void {
  dom.style.setProperty(
    "--tts-word-color",
    settings.highlightWordColor || DEFAULT_WORD_COLOR,
  );
  if (settings.highlightSentenceColor) {
    dom.style.setProperty(
      "--tts-sentence-color",
      settings.highlightSentenceColor,
    );
    dom.dataset.ttsSentenceColor = "custom";
  } else {
    dom.style.removeProperty("--tts-sentence-color");
    delete dom.dataset.ttsSentenceColor;
  }
}

function createWordHighlightPlugin(
  player: AudioStore,
  sink: AudioSink,
  settings: TTSPluginSettings,
  getActiveEditor: () => EditorView | undefined,
) {
  return ViewPlugin.define((view): PluginValue => {
    let current: WordHighlightRange | null = null;
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;

    const disposeColors = mobx.autorun(() =>
      applyHighlightColors(view.dom, settings),
    );

    const tick = () => {
      frame = undefined;
      timer = undefined;
      if (destroyed) {
        return;
      }
      const next =
        settings.highlightWords && getActiveEditor() === view
          ? computeWordHighlight(player, sink, settings.playbackSpeed)
          : null;
      const valid = !next || next.to <= view.state.doc.length;
      const target = valid ? next : null;
      if (target?.from !== current?.from || target?.to !== current?.to) {
        current = target;
        view.dispatch({ effects: setWordHighlight.of(target) });
      }
      if (sink.isPlaying) {
        frame = requestAnimationFrame(tick);
      } else {
        timer = setTimeout(tick, IDLE_POLL_MILLIS);
      }
    };
    timer = setTimeout(tick, 0);

    return {
      destroy() {
        destroyed = true;
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (timer !== undefined) clearTimeout(timer);
        disposeColors();
      },
    };
  });
}

const sweep = (size: string) =>
  `linear-gradient(var(--tts-word-bg), var(--tts-word-bg)) left / ${size} no-repeat`;

const wordHighlightTheme = EditorView.baseTheme({
  "&": {
    "--tts-word-bg":
      "color-mix(in srgb, var(--tts-word-color) 45%, transparent)",
  },
  "&[data-tts-sentence-color] .tts-cm-playing-now": {
    backgroundColor:
      "color-mix(in srgb, var(--tts-sentence-color) 35%, transparent)",
  },
  "&[data-tts-sentence-color] .tts-cm-playing-before, &[data-tts-sentence-color] .tts-cm-playing-after":
    {
      backgroundColor:
        "color-mix(in srgb, var(--tts-sentence-color) 14%, transparent)",
    },
  ".tts-cm-playing-now, .tts-cm-playing-before, .tts-cm-playing-after": {
    transition: "background-color 0.3s ease",
  },
  ".tts-cm-word-now": {
    borderRadius: "3px",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  },
  ".tts-word-anim-none, .tts-word-anim-pop, .tts-word-anim-glow": {
    backgroundColor: "var(--tts-word-bg)",
  },
  ".tts-word-anim-sweep": {
    background: sweep("100% 100%"),
    animation: "tts-word-sweep var(--tts-word-duration, 0.25s) ease-out",
  },
  ".tts-word-anim-pop": {
    animation: "tts-word-pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.3)",
  },
  ".tts-word-anim-glow": {
    textShadow: "0 0 10px var(--tts-word-color)",
    animation: "tts-word-glow 0.35s ease-out",
  },
  ".tts-word-anim-underline": {
    background:
      "linear-gradient(var(--tts-word-color), var(--tts-word-color)) left bottom / 100% 2px no-repeat",
    animation: "tts-word-underline var(--tts-word-duration, 0.25s) ease-out",
  },
  "@keyframes tts-word-sweep": {
    from: { backgroundSize: "0% 100%" },
    to: { backgroundSize: "100% 100%" },
  },
  "@keyframes tts-word-pop": {
    from: {
      backgroundColor: "transparent",
      boxShadow: "0 0 0 0 var(--tts-word-bg)",
    },
    "50%": { boxShadow: "0 0 0 4px var(--tts-word-bg)" },
    to: { boxShadow: "0 0 0 0 transparent" },
  },
  "@keyframes tts-word-glow": {
    from: { textShadow: "0 0 0 transparent", backgroundColor: "transparent" },
  },
  "@keyframes tts-word-underline": {
    from: { backgroundSize: "0% 2px" },
    to: { backgroundSize: "100% 2px" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    ".tts-cm-word-now": { animation: "none" },
  },
});

/** Highlights the word currently being spoken, following audio playback time */
export function createWordHighlightExtension(
  player: AudioStore,
  sink: AudioSink,
  settings: TTSPluginSettings,
  getActiveEditor: () => EditorView | undefined,
): Extension {
  return [
    createWordHighlightField(settings),
    createWordHighlightPlugin(player, sink, settings, getActiveEditor),
    wordHighlightTheme,
  ];
}
