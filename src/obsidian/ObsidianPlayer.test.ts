import { describe, it, expect, vi } from "vitest";
import { configurableAudioCache, obsidianFileVault } from "./ObsidianPlayer";
import { createTestSettingsStore } from "../components/test-utils";

// Mock dependencies
vi.mock("../web/IndexedDBAudioStorage", () => ({
  IndexedDBAudioStorage: vi.fn(() => ({
    getAudio: vi.fn(),
    saveAudio: vi.fn(),
    ready: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock("obsidian", () => ({
  App: vi.fn(),
  normalizePath: vi.fn((path: string) => path),
}));

describe("ObsidianPlayer", () => {
  describe("configurableAudioCache", () => {
    it("should create cache without crashing", async () => {
      const mockApp = {} as any;
      const settingsStore = await createTestSettingsStore();

      const cache = configurableAudioCache(mockApp, settingsStore);

      expect(cache).toBeDefined();
      expect(typeof cache.getAudio).toBe("function");
      expect(typeof cache.destroy).toBe("function");
    });

    it("should have destroy method", async () => {
      const mockApp = {} as any;
      const settingsStore = await createTestSettingsStore();

      const cache = configurableAudioCache(mockApp, settingsStore);

      // Should not crash when calling destroy
      expect(() => cache.destroy()).not.toThrow();
    });
  });

  describe("obsidianFileVault", () => {
    it("should create vault cache without crashing", () => {
      const mockApp = {
        vault: {
          adapter: {
            read: vi.fn(),
            write: vi.fn(),
            exists: vi.fn(() => Promise.resolve(false)),
            remove: vi.fn(),
          },
        },
      } as any;

      const cache = obsidianFileVault(mockApp);

      expect(cache).toBeDefined();
      expect(typeof cache.getAudio).toBe("function");
      expect(typeof cache.saveAudio).toBe("function");
    });
  });
});
