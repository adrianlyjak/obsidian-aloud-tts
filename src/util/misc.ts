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
  { minLength = 8, maxLength = 300 }: { minLength?: number; maxLength?: number } = {},
): string[] {
  // 改进的文本分割函数，支持中英文混合文本
  let remaining = text;
  const sentences: string[] = [];
  
  while (remaining.length > 0) {
    let buff = "";
    let foundBreak = false;
    
    // 首先尝试找到合适的句子分割点
    for (let i = minLength; i < Math.min(remaining.length, maxLength); i++) {
      buff = remaining.slice(0, i + 1);
      
      // 检查是否遇到句子结束标记
      const char = remaining[i];
      const nextChar = remaining[i + 1];
      
      // 中文句号、问号、感叹号
      if (char && /[。！？；]/.test(char)) {
        // 如果下一个字符是引号、括号等，包含进来
        let endIndex = i + 1;
        while (endIndex < remaining.length && /[""''）】』」》〉]/.test(remaining[endIndex])) {
          endIndex++;
        }
        buff = remaining.slice(0, endIndex);
        foundBreak = true;
        break;
      }
      
      // 英文句号、问号、感叹号（后面不能直接跟字母或数字）
      if (char && /[.!?]/.test(char) && (!nextChar || !/[a-zA-Z0-9]/.test(nextChar))) {
        // 包含后续的引号、空格等
        let endIndex = i + 1;
        while (endIndex < remaining.length && /[""'')\]\s]/.test(remaining[endIndex])) {
          endIndex++;
        }
        buff = remaining.slice(0, endIndex);
        foundBreak = true;
        break;
      }
      
      // 换行符
      if (char === '\n') {
        buff = remaining.slice(0, i + 1);
        foundBreak = true;
        break;
      }
    }
    
    // 如果没有找到合适的分割点，但已经达到最大长度
    if (!foundBreak && remaining.length > maxLength) {
      // 尝试在逗号、分号等次要分割点分割
      for (let i = Math.min(maxLength - 1, remaining.length - 1); i >= minLength; i--) {
        const char = remaining[i];
        if (/[，,；;、：:]/.test(char)) {
          buff = remaining.slice(0, i + 1);
          foundBreak = true;
          break;
        }
      }
      
      // 如果还是没找到，强制在最大长度处分割
      if (!foundBreak) {
        buff = remaining.slice(0, maxLength);
        foundBreak = true;
      }
    }
    
    // 如果剩余文本不长，直接取完
    if (!foundBreak) {
      buff = remaining;
    }
    
    // 移除已处理的部分
    remaining = remaining.slice(buff.length);
    
    // 清理文本块：移除换行符，规范化空白字符
    const cleanedBuff = cleanTextChunk(buff);
    
    // 添加到结果中（确保有实际可读内容）
    if (hasReadableContent(cleanedBuff)) {
      sentences.push(cleanedBuff);
    }
  }
  
  return sentences;
}

/**
 * 清理文本块：移除换行符，规范化空白字符
 */
function cleanTextChunk(text: string): string {
  return text
    // 将所有换行符替换为空格
    .replace(/\n/g, ' ')
    // 将多个连续空白字符替换为单个空格
    .replace(/\s+/g, ' ')
    // 移除首尾空白
    .trim();
}

/**
 * 检查文本是否包含可读内容（不仅仅是标点符号和空白）
 */
function hasReadableContent(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }
  
  // 移除所有空白字符和常见标点符号后，检查是否还有内容
  const contentOnly = text.replace(/[\s\n\r\t""''""''（）()【】\[\]《》<>「」『』、，,。.！!？?；;：:…—–-]/g, '');
  
  // 如果还有字符剩余，说明有可读内容
  return contentOnly.length > 0;
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
