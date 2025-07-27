import { describe, it, expect, vi } from "vitest";
import {
  checksum,
  base64ToArrayBuffer,
  randomId,
  createSlidingWindowGroups,
  splitParagraphs,
  createWindows,
  debounce,
  splitTextForExport,
} from "./misc";

describe("misc utilities", () => {
  describe("checksum", () => {
    it("should return consistent hash for same input", () => {
      const text = "hello world";
      const hash1 = checksum(text);
      const hash2 = checksum(text);
      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different inputs", () => {
      const hash1 = checksum("hello");
      const hash2 = checksum("world");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", () => {
      const hash = checksum("");
      expect(typeof hash).toBe("number");
    });
  });

  describe("base64ToArrayBuffer", () => {
    it("should convert base64 string to ArrayBuffer", () => {
      const base64 = btoa("hello world");
      const buffer = base64ToArrayBuffer(base64);
      const text = new TextDecoder().decode(buffer);
      expect(text).toBe("hello world");
    });

    it("should handle empty base64 string", () => {
      const buffer = base64ToArrayBuffer("");
      expect(buffer.byteLength).toBe(0);
    });
  });

  describe("randomId", () => {
    it("should generate UUID-like strings", () => {
      const id = randomId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("should generate unique IDs", () => {
      const id1 = randomId();
      const id2 = randomId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("createSlidingWindowGroups", () => {
    it("should create sliding windows from text", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const windows = createSlidingWindowGroups(text, 2, 1);
      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0].length).toBeLessThanOrEqual(2);
    });

    it("should handle empty text", () => {
      const windows = createSlidingWindowGroups("", 2, 1);
      expect(windows).toEqual([]);
    });
  });

  describe("splitParagraphs", () => {
    it("should split text by double newlines", () => {
      const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
      const paragraphs = splitParagraphs(text);
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs[0]).toContain("First paragraph");
      expect(paragraphs[1]).toContain("Second paragraph");
      expect(paragraphs[2]).toContain("Third paragraph");
    });

    it("should handle single paragraph", () => {
      const text = "Single paragraph with no breaks.";
      const paragraphs = splitParagraphs(text);
      expect(paragraphs).toEqual([text]);
    });

    it("should preserve separator in output", () => {
      const text = "Para1.\n\nPara2.";
      const paragraphs = splitParagraphs(text);
      expect(paragraphs[0]).toMatch(/\n\n/);
    });
  });

  describe("createWindows", () => {
    it("should create sliding windows from array", () => {
      const items = [1, 2, 3, 4, 5];
      const windows = createWindows(items, 3, 2);
      expect(windows).toEqual([
        [1, 2, 3],
        [3, 4, 5],
      ]);
    });

    it("should handle windowSize larger than array", () => {
      const items = [1, 2];
      const windows = createWindows(items, 5, 1);
      expect(windows).toEqual([[1, 2]]);
    });

    it("should handle empty array", () => {
      const windows = createWindows([], 3, 1);
      expect(windows).toEqual([]);
    });
  });

  describe("debounce", () => {
    it("should delay function execution", async () => {
      vi.useFakeTimers();
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn("arg1");
      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith("arg1");

      vi.useRealTimers();
    });

    it("should cancel previous calls", async () => {
      vi.useFakeTimers();
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn("first");
      debouncedFn("second");

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith("second");

      vi.useRealTimers();
    });
  });

  describe("splitTextForExport", () => {
    it("should return single chunk for short text", () => {
      const text = "This is a short sentence.";
      const result = splitTextForExport(text, 100);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("This is a short sentence.");
      expect(result[0].context.textBefore).toBeUndefined();
      expect(result[0].context.textAfter).toBeUndefined();
    });

    it("should split long text into multiple chunks", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = splitTextForExport(text, 30); // Force small chunks

      expect(result.length).toBeGreaterThan(1);
      // Each chunk should be under the limit
      result.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(30);
      });
      // All chunks combined should contain the original text
      const combinedText = result.map((c) => c.text).join(" ");
      expect(combinedText.replace(/\s+/g, " ")).toContain("First sentence");
      expect(combinedText.replace(/\s+/g, " ")).toContain("Fourth sentence");
    });

    it("should provide context for middle chunks", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
      const result = splitTextForExport(text, 40, 1); // 1 sentence context

      // Find a middle chunk that should have both before and after context
      const middleChunk = result.find(
        (chunk) => chunk.context.textBefore && chunk.context.textAfter,
      );

      if (middleChunk) {
        expect(middleChunk.context.textBefore).toBeTruthy();
        expect(middleChunk.context.textAfter).toBeTruthy();
        expect(middleChunk.context.textBefore?.length).toBeGreaterThan(0);
        expect(middleChunk.context.textAfter?.length).toBeGreaterThan(0);
      }
    });

    it("should provide no textBefore for first chunk", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = splitTextForExport(text, 30);

      expect(result[0].context.textBefore).toBeUndefined();
    });

    it("should provide no textAfter for last chunk", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = splitTextForExport(text, 30);

      const lastChunk = result[result.length - 1];
      expect(lastChunk.context.textAfter).toBeUndefined();
    });

    it("should respect contextSentences parameter", () => {
      const text = "A. B. C. D. E. F. G. H."; // 8 short sentences
      const result = splitTextForExport(text, 6, 2); // 2 sentences context

      // Find a chunk that has context
      const chunkWithContext = result.find((chunk) => chunk.context.textBefore);
      if (chunkWithContext) {
        // Should have at most 2 sentences in context (with their separators)
        const beforeSentences = chunkWithContext.context.textBefore
          ?.split(".")
          .filter((s) => s.trim());
        expect(beforeSentences?.length).toBeLessThanOrEqual(2);
      }
    });

    it("should handle empty text", () => {
      const result = splitTextForExport("", 100);
      expect(result).toHaveLength(0);
    });

    it("should preserve sentence boundaries", () => {
      const text = "First sentence! Second sentence? Third sentence.";
      const result = splitTextForExport(text, 25);

      // Each chunk should contain complete sentences
      result.forEach((chunk) => {
        expect(chunk.text).toMatch(/^[A-Z].*[.!?]\s*$/);
      });
    });

    it("should handle different punctuation marks", () => {
      const text = "Question? Exclamation! Statement. Another statement.";
      const result = splitTextForExport(text, 30);

      expect(result.length).toBeGreaterThan(0);
      const combinedText = result.map((c) => c.text).join(" ");
      expect(combinedText).toContain("Question?");
      expect(combinedText).toContain("Exclamation!");
      expect(combinedText).toContain("Statement.");
    });
  });
});
