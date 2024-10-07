export function checksum(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
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

export function splitParagraphs(text: string): string[] {
  return [...genParagraphs(text)];
}
function* genParagraphs(text: string): Iterable<string> {
  let lastIndex = 0;
  const splitRegex = /\n\s*\n\s*/g;
  let result: RegExpExecArray | null;
  while ((result = splitRegex.exec(text))) {
    const index = result.index;
    yield text.substring(lastIndex, index) + result[0];
    lastIndex = index + result[0].length;
  }
  if (lastIndex < text.length) {
    yield text.substring(lastIndex);
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
