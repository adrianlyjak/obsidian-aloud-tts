import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";

// Mock the idb library
vi.mock("idb", () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        delete: vi.fn(),
        iterate: vi.fn(() => Promise.resolve()),
        index: vi.fn(() => ({
          getAll: vi.fn(() => Promise.resolve([])),
        })),
      })),
      done: Promise.resolve(),
    })),
    getAllFromIndex: vi.fn(() => Promise.resolve([])),
  })),
}));

describe("IndexedDBAudioStorage", () => {
  let storage: IndexedDBAudioStorage;

  beforeEach(() => {
    storage = new IndexedDBAudioStorage();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should instantiate without crashing", () => {
    expect(storage).toBeDefined();
    expect(storage).toBeInstanceOf(IndexedDBAudioStorage);
  });

  it("should have ready method", async () => {
    expect(typeof storage.ready).toBe("function");
    
    // The ready method should return a promise
    const readyPromise = storage.ready();
    expect(readyPromise).toBeInstanceOf(Promise);
    
    // Should resolve without error
    await expect(readyPromise).resolves.toBeUndefined();
  });

  it("should have getStorageSize method", () => {
    expect(typeof storage.getStorageSize).toBe("function");
  });

  it("should have getAudio method", () => {
    expect(typeof storage.getAudio).toBe("function");
  });

  it("should have saveAudio method", () => {
    expect(typeof storage.saveAudio).toBe("function");
  });

  it("should have expire method", () => {
    expect(typeof storage.expire).toBe("function");
  });
}); 