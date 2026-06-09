import { afterEach, beforeEach, vi, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock window.matchMedia which is not available in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Clean up DOM between tests
beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanup();
  // Restore real timers if a test used fake timers, then clear any pending
  // macrotasks so they don't bleed into the next test or surface as unhandled
  // rejections in vitest 4+.
  vi.useRealTimers();
  vi.clearAllTimers();
});
