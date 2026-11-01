import type { WordTiming } from "../models/tts-model";

export interface WordToken {
  word: string;
  /** offset of the first character, relative to the tokenized string */
  from: number;
  /** offset after the last character, relative to the tokenized string */
  to: number;
}

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** A word in the source document, with its timing in the chunk's audio */
export interface TimedWordRange {
  /** offset relative to the chunk's raw text */
  from: number;
  /** offset relative to the chunk's raw text */
  to: number;
  start: number;
  end: number;
}

const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:['’\-.][\p{L}\p{N}\p{M}]+)*/gu;

export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD_PATTERN)) {
    const from = match.index ?? 0;
    tokens.push({ word: match[0], from, to: from + match[0].length });
  }
  return tokens;
}

/** Converts per-character alignment (e.g. from ElevenLabs) into per-word timings */
export function wordTimingsFromAlignment(
  alignment: CharacterAlignment,
): WordTiming[] {
  const { characters } = alignment;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const charOffsets: number[] = [];
  let text = "";
  for (const ch of characters) {
    charOffsets.push(text.length);
    text += ch;
  }
  const charIndexAt = (offset: number): number => {
    let lo = 0;
    let hi = charOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (charOffsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return tokenizeWords(text).map((token) => ({
    word: token.word,
    start: starts[charIndexAt(token.from)] ?? 0,
    end: ends[charIndexAt(token.to - 1)] ?? 0,
  }));
}

/**
 * Estimates word timings by distributing the audio duration across words,
 * weighted by word length plus a pause for trailing punctuation.
 */
export function estimateWordTimings(
  text: string,
  durationSeconds: number,
): WordTiming[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length || !(durationSeconds > 0)) {
    return [];
  }
  const weights = tokens.map((token, i) => {
    const gap = text.slice(token.to, tokens[i + 1]?.from ?? text.length);
    let pause = 0;
    if (/[.!?;:]/.test(gap)) pause = 4;
    else if (/[,—–]/.test(gap)) pause = 2;
    return { speak: token.word.length + 2, pause };
  });
  const total = weights.reduce((sum, w) => sum + w.speak + w.pause, 0);
  const lead = Math.min(0.1, durationSeconds * 0.03);
  const perUnit = (durationSeconds - lead) / total;
  let cursor = lead;
  return tokens.map((token, i) => {
    const start = cursor;
    const end = start + weights[i].speak * perUnit;
    cursor = end + weights[i].pause * perUnit;
    return { word: token.word, start, end };
  });
}

const normalize = (word: string): string =>
  word.toLowerCase().replace(/[’]/g, "'");

/**
 * Maps timed words (from the cleaned text sent to TTS) back onto word positions
 * in the raw document text, skipping markdown syntax such as link urls.
 */
export function mapTimingsToRawText(
  rawText: string,
  timings: WordTiming[],
): TimedWordRange[] {
  const rawTokens = tokenizeWords(rawText);
  const result: TimedWordRange[] = [];
  const LOOKAHEAD = 12;
  let rawIndex = 0;
  for (const timing of timings) {
    const target = normalize(timing.word);
    let found = -1;
    for (
      let j = rawIndex;
      j < Math.min(rawTokens.length, rawIndex + LOOKAHEAD);
      j++
    ) {
      if (normalize(rawTokens[j].word) === target) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      continue;
    }
    result.push({
      from: rawTokens[found].from,
      to: rawTokens[found].to,
      start: timing.start,
      end: timing.end,
    });
    rawIndex = found + 1;
  }
  return result;
}

/** Returns the index of the word being spoken at `time`, or -1 before the first word */
export function findWordIndexAt(
  words: { start: number }[],
  time: number,
): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
