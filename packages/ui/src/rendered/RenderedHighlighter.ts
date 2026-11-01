import {
  AudioSink,
  AudioStore,
  AudioTextChunk,
  TTSPluginSettings,
  WordTiming,
  estimateWordTimings,
  findWordIndexAt,
} from "open-tts";
import { findTextRange } from "./findTextRange";
import { findWordRanges } from "./findWordRanges";
import { HighlightPainter, highlightPainterFor } from "./highlightRegistry";

/** CSS Highlight API registry names, styled with ::highlight() in styles.css */
export const SENTENCE_HIGHLIGHT = "tts-rendered-sentence";
export const WORD_HIGHLIGHT = "tts-rendered-word";

/** Returns the rendered element showing a chunk's text, or null when there is none */
export type RenderedRootFinder = (chunk: AudioTextChunk) => Element | null;

interface ChunkMatch {
  chunk: AudioTextChunk;
  root: Element;
  sentence: Range;
  /** whether the sentence was found, or the whole root stands in for it */
  matched: boolean;
  timings: WordTiming[];
  words: (Range | null)[];
}

function wholeRoot(root: Element): Range {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  return range;
}

/**
 * Highlights the sentence and word being spoken in rendered markdown (embeds in
 * Live Preview, or Reading View), where editor decorations can't reach. A host
 * supplies how to find the rendered element for a chunk and calls `update()`
 * each frame while playing.
 */
export class RenderedHighlighter {
  private match: ChunkMatch | null = null;
  private previous: { root: Element; sentence: Range } | null = null;
  /** paints in the window showing the current root; null when nothing is painted */
  private painter: HighlightPainter | null = null;

  constructor(
    private player: AudioStore,
    private sink: AudioSink,
    private settings: TTSPluginSettings,
    private findRoot: RenderedRootFinder,
    private scrollIntoView: (element: Element) => void = (element) =>
      element.scrollIntoView({ block: "nearest" }),
  ) {}

  update(): void {
    const chunk = this.player.activeText?.currentChunk;
    const root = chunk ? this.findRoot(chunk) : null;
    const painter = root ? highlightPainterFor(root) : null;
    if (!chunk || !root || !painter || chunk.timelineStartSeconds == null) {
      this.clear();
      return;
    }
    if (this.painter && this.painter.window !== painter.window) {
      // the text moved to another window (e.g. a pop-out): unpaint the old one
      this.clear();
    }
    this.painter = painter;
    if (this.match?.chunk !== chunk || this.match.root !== root) {
      this.match = this.matchChunk(chunk, root);
      this.paintSentence();
    }
    this.paintWord();
  }

  clear(): void {
    this.match = null;
    this.painter?.delete(SENTENCE_HIGHLIGHT);
    this.painter?.delete(WORD_HIGHLIGHT);
    this.painter = null;
  }

  private matchChunk(chunk: AudioTextChunk, root: Element): ChunkMatch {
    const after = this.previous?.root === root ? this.previous.sentence : null;
    const sentence =
      findTextRange(root, chunk.text, { after }) ??
      findTextRange(root, chunk.text);
    if (sentence) {
      this.previous = { root, sentence };
    }
    const match: ChunkMatch = {
      chunk,
      root,
      sentence: sentence ?? wholeRoot(root),
      matched: !!sentence,
      timings: [],
      words: [],
    };
    this.matchWords(match);
    return match;
  }

  /** Times and locates the chunk's words inside its matched sentence */
  private matchWords(match: ChunkMatch): void {
    const { chunk } = match;
    match.timings =
      chunk.audio?.wordTimings ??
      (chunk.duration ? estimateWordTimings(chunk.text, chunk.duration) : []);
    match.words = match.matched
      ? findWordRanges(
          match.sentence,
          match.timings.map((timing) => timing.word),
        )
      : [];
  }

  private paintSentence(): void {
    const match = this.match!;
    const painter = this.painter!;
    painter.set(SENTENCE_HIGHLIGHT, match.sentence);
    painter.delete(WORD_HIGHLIGHT);
    const start = match.sentence.startContainer;
    const element =
      start.nodeType === Node.ELEMENT_NODE
        ? (start as Element)
        : start.parentElement;
    if (element && this.player.autoScrollEnabled) {
      this.scrollIntoView(element);
    }
  }

  private paintWord(): void {
    const match = this.match!;
    const painter = this.painter!;
    if (!this.settings.highlightWords || !match.matched) {
      painter.delete(WORD_HIGHLIGHT);
      return;
    }
    // Timings can arrive after the sentence was matched (estimates need the duration)
    if (!match.timings.length && match.chunk.duration) {
      this.matchWords(match);
    }
    const time = this.sink.currentTime - match.chunk.timelineStartSeconds!;
    const index = findWordIndexAt(match.timings, time);
    const word = index >= 0 ? match.words[index] : null;
    if (word) {
      painter.set(WORD_HIGHLIGHT, word);
    } else {
      painter.delete(WORD_HIGHLIGHT);
    }
  }
}
