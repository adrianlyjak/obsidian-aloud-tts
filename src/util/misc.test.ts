import { describe, it, expect, vi } from "vitest";
import {
  checksum,
  base64ToArrayBuffer,
  randomId,
  createSlidingWindowGroups,
  splitParagraphs,
  createWindows,
  debounce,
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
});
