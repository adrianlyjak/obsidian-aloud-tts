import { describe, it, expect } from "vitest";
import { permanentCacheKey, generateHash } from "./PermanentCache";

describe("permanentCacheKey", () => {
  it("returns a 64-character hex string", async () => {
    const hash = await permanentCacheKey("hello", {
      model: "fish",
      voice: "v",
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const opts = { model: "fish", voice: "paul-graham", instructions: "short" };
    const a = await permanentCacheKey("test text", opts);
    const b = await permanentCacheKey("test text", opts);
    expect(a).toBe(b);
  });

  it("differs when text changes", async () => {
    const opts = { model: "fish", voice: "v" };
    const a = await permanentCacheKey("sentence one", opts);
    const b = await permanentCacheKey("sentence two", opts);
    expect(a).not.toBe(b);
  });

  it("differs when voice changes", async () => {
    const a = await permanentCacheKey("same", { model: "fish", voice: "a" });
    const b = await permanentCacheKey("same", { model: "fish", voice: "b" });
    expect(a).not.toBe(b);
  });

  it("differs when model changes", async () => {
    const a = await permanentCacheKey("text", { model: "fish", voice: "v" });
    const b = await permanentCacheKey("text", {
      model: "chatterbox",
      voice: "v",
    });
    expect(a).not.toBe(b);
  });

  it("differs when instructions change", async () => {
    const a = await permanentCacheKey("text", {
      model: "fish",
      voice: "v",
      instructions: "short",
    });
    const b = await permanentCacheKey("text", {
      model: "fish",
      voice: "v",
      instructions: "long",
    });
    expect(a).not.toBe(b);
  });

  it("strips leading/trailing whitespace before hashing", async () => {
    const a = await permanentCacheKey("  hello  ", {
      model: "fish",
      voice: "v",
    });
    const b = await permanentCacheKey("hello", { model: "fish", voice: "v" });
    expect(a).toBe(b);
  });
});

describe("generateHash (compat wrapper)", () => {
  it("returns a hex string", async () => {
    const hash = await generateHash("hello", "voice", {});
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await generateHash("text", "v", { exaggeration: 0.45 });
    const b = await generateHash("text", "v", { exaggeration: 0.45 });
    expect(a).toBe(b);
  });
});
