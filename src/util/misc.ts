export function checksum(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function randomId(): string {
  const S4 = () => {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };
  return [S4() + S4(), S4(), S4(), S4(), S4() + S4() + S4()].join("-");
}

export function createSlidingWindowGroups(
  text: string,
  windowSize: number = 12,
  stepSize: number = 3,
): string[][] {
  // Create sliding windows of 5 sentences
  const sentences = splitSentences(text);
  return createWindows(sentences, windowSize, stepSize);
}

export function splitParagraphs(
  text: string,
  { maxChunkSize }: { maxChunkSize?: number } = {},
): string[] {
  return [...genParagraphs(text, { maxChunkSize })];
}
function* genParagraphs(
  text: string,
  { maxChunkSize = 4000 }: { maxChunkSize?: number } = {},
): Iterable<string> {
  let lastIndex = 0;
  const splitRegex = /\n\s*\n\s*/g;
  let result: RegExpExecArray | null;
  while ((result = splitRegex.exec(text))) {
    const index = result.index;
    const paragraph = text.substring(lastIndex, index) + result[0];
    lastIndex = index + result[0].length;
    for (const chunk of splitAlongSentenceBoundariesWithMaxLength(
      paragraph,
      maxChunkSize,
    )) {
      yield chunk;
    }
  }
  if (lastIndex < text.length) {
    for (const chunk of splitAlongSentenceBoundariesWithMaxLength(
      text.substring(lastIndex),
      maxChunkSize,
    )) {
      yield chunk;
    }
  }
}

function splitAlongSentenceBoundariesWithMaxLength(
  text: string,
  maxLength: number,
): string[] {
  if (text.length <= maxLength) {
    return [text];
  } else {
    const sentences = splitSentences(text, { minLength: 20 });
    const chunks = [""];
    for (const sentence of sentences) {
      const currentChunk = chunks[chunks.length - 1];
      // always append to the current chunk if its empty (even if longer than a chunk!)
      // this seems better than the alternative of even further splitting.
      // or if it exceeds the max length (once trimmed)
      if (
        currentChunk &&
        currentChunk.length + sentence.trim().length > maxLength
      ) {
        chunks.push(sentence);
      } else {
        // otherwise, append the current chunk
        chunks[chunks.length - 1] += sentence;
      }
    }
    return chunks;
  }
}

export function splitSentences(
  text: string,
  { minLength = 8 }: { minLength?: number } = {},
): string[] {
  // Split the text into sentences while keeping the separators (periods, exclamation marks, etc.)
  let remaining = text;
  const sentences: string[] = [];
  while (remaining.length > 0) {
    // take at least `minLength` characters, stop early for `\n`
    // then look for next punctuation. One of `.`, `!`, `?`, `\n`
    // if one of `.`, `!`, `?`, must not be immediately followed by a letter.
    //   additionally capture all trailing quotes, and similiar "container" characters, such as markdown * and _ (repeating)
    // then take all whitespace including line breaks
    let buff = remaining.slice(0, minLength);
    remaining = remaining.slice(minLength);
    const match = remaining.match(/(\n+\s*|[.!?][^a-zA-Z0-9]*\s+)/);
    if (match) {
      buff += remaining.slice(0, match.index! + 1);
      remaining = remaining.slice(match.index! + 1);
      const isLinebreak = buff[buff.length - 1] === "\n";
      if (!isLinebreak) {
        while (true) {
          const next = remaining[0];
          if (!next || next.match(/[a-zA-Z\s]/)) {
            break;
          } else {
            buff += next;
            remaining = remaining.slice(1);
          }
        }
      }
      while (true) {
        const next = remaining[0];
        if (next?.match(/\s/)) {
          buff += next;
          remaining = remaining.slice(1);
        } else {
          break;
        }
      }
      sentences.push(buff);
    } else {
      buff += remaining;
      sentences.push(buff);
      remaining = "";
    }
  }
  return sentences;
}
// Function to create sliding windows of 5 sentences
export function createWindows<T>(
  sentences: T[],
  windowSize: number,
  windowStep: number,
): T[][] {
  const windows: T[][] = [];

  for (let i = 0; i < sentences.length; i += windowStep) {
    windows.push(sentences.slice(i, i + windowSize));
    if (i + windowSize >= sentences.length) {
      break;
    }
  }

  return windows;
}

export function debounce<Args extends any[]>(
  cb: (...args: Args) => void,
  wait: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const callable = (...args: Args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => cb(...args), wait);
  };
  return callable;
}

export interface TextChunkWithContext {
  text: string;
  context: {
    textBefore?: string;
    textAfter?: string;
  };
}

/**
 * Split text into chunks that fit within model limits while preserving sentence boundaries
 * and providing context for seamless audio generation
 */
export function splitTextForExport(
  text: string,
  maxChunkSize: number,
  contextSentences: number = 3,
): TextChunkWithContext[] {
  // Use existing sentence splitting logic with small min length
  const sentences = splitSentences(text, { minLength: 1 });

  // Group sentences into chunks that fit within the size limit
  const chunkGroups: {
    sentences: string[];
    startIndex: number;
    endIndex: number;
  }[] = [];
  let currentGroup: string[] = [];
  let currentSize = 0;
  let groupStartIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const newSize = currentSize + sentence.length;

    // If adding this sentence would exceed the limit, finalize current group
    if (currentGroup.length > 0 && newSize > maxChunkSize) {
      chunkGroups.push({
        sentences: [...currentGroup],
        startIndex: groupStartIndex,
        endIndex: i - 1,
      });
      currentGroup = [sentence];
      currentSize = sentence.length;
      groupStartIndex = i;
    } else {
      currentGroup.push(sentence);
      currentSize = newSize;
    }
  }

  // Add the final group if it has content
  if (currentGroup.length > 0) {
    chunkGroups.push({
      sentences: currentGroup,
      startIndex: groupStartIndex,
      endIndex: sentences.length - 1,
    });
  }

  // Convert groups to chunks with context
  return chunkGroups.map((group) => {
    const chunkText = group.sentences.join("").trim();

    // Get context sentences before and after this group
    const beforeSentences = sentences.slice(
      Math.max(0, group.startIndex - contextSentences),
      group.startIndex,
    );
    const afterSentences = sentences.slice(
      group.endIndex + 1,
      Math.min(sentences.length, group.endIndex + 1 + contextSentences),
    );

    return {
      text: chunkText,
      context: {
        textBefore:
          beforeSentences.length > 0 ? beforeSentences.join("") : undefined,
        textAfter:
          afterSentences.length > 0 ? afterSentences.join("") : undefined,
      },
    };
  });
}
