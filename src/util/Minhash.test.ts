import { describe, it, expect } from "vitest";
import { INTERNAL, Minhash, hashStrings } from "./Minhash";

describe("Minhash", () => {
  it("should correctly hash a string", () => {
    const hash = hashStrings(["test string"])[0];
    expect(hash).toBeGreaterThan(0);
  });

  it("should create consistent hash values for the same input", () => {
    const hash = hashStrings(["consistent input", "consistent input"]);
    expect(hash[0]).toEqual(hash[1]);
  });

  it("should create different hash values for different inputs", () => {
    const hash = hashStrings(["input one", "input two"]);
    expect(hash[0]).not.toEqual(hash[1]);
  });

  it("should estimate Jaccard similarity close to 1 for identical sets", () => {
    const minhash1 = new Minhash();
    const minhash2 = new Minhash();

    minhash1.update("identical set");
    minhash2.update("identical set");

    const similarity = minhash1.jaccard(minhash2);
    expect(similarity).toBeCloseTo(1, 1);
  });

  it("should estimate Jaccard similarity close to 0 for completely different sets", () => {
    const minhash1 = new Minhash();
    const minhash2 = new Minhash();

    minhash1.update("set one");
    minhash2.update("set two");

    const similarity = minhash1.jaccard(minhash2);
    expect(similarity).toBeCloseTo(0, 1);
  });

  it("should handle updates with multiple data points", () => {
    const minhash = new Minhash();
    minhash.update("data point one");
    minhash.update("data point two");

    // We expect internal hash values to be updated
    // The exact values depend on the hash function and permutations
    expect(
      minhash.hashvalues.some((value) => value !== INTERNAL.MAX_HASH),
    ).toBe(true);
  });

  // Additional tests can be added to cover more scenarios and edge cases
});
