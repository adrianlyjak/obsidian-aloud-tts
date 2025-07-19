// 32-bit int
const MAX_HASH = Math.pow(2, 32) - 1;
// The prime number larger than the max possible hash value for 32-bit integers
const PRIME = 4294967311;

export const INTERNAL = {
  MAX_HASH,
  PRIME,
};
/**
 * Minhash class - generates minhash signatures for sets.
 * Minhash is a probabilistic data structure for estimating the similarity between datasets.
 */
export class Minhash {
  // optional cache managed by LSH index
  public hashvalues: number[];
  public hashbands?: string[];

  private config: { numPerm: number; seed: number };

  private permA: number[];
  private permB: number[];

  constructor({
    numPerm = 128,
    seed = 1,
  }: { numPerm?: number; seed?: number } = {}) {
    this.config = { numPerm, seed };
    const rng = RandomishGenerator({ seed, maxValue: MAX_HASH });

    // Initializing hash values and permutation functions
    this.hashvalues = Array(this.config.numPerm).fill(MAX_HASH);
    // Initializes the permutation functions for a & b.
    // This ensures unique integers for each permutation.
    const unique = sampleListOfUniqueInts(this.config.numPerm * 2, rng);
    this.permA = unique.slice(0, this.config.numPerm);
    this.permB = unique.slice(this.config.numPerm);
  }

  /**
   * Updates internal hash values given a string.
   * The hash values represent the minhash signature of the input data.
   */
  public update(str: string): void {
    for (let i = 0; i < this.hashvalues.length; i++) {
      const a = this.permA[i];
      const b = this.permB[i];
      const hash = (a * hashStrings([str])[0] + b) % PRIME;
      this.hashvalues[i] = Math.min(this.hashvalues[i], hash);
    }
  }

  /**
   * Estimates the Jaccard similarity with another Minhash.
   * Jaccard similarity is the size of the intersection divided by the size of the union of the sample sets.
   */
  public jaccard(other: Minhash): number {
    if (this.hashvalues.length !== other.hashvalues.length) {
      throw new Error("Hashvalue counts differ");
    } else if (this.config.seed !== other.config.seed) {
      throw new Error("Seed values differ");
    }
    let shared = 0;
    for (let i = 0; i < this.hashvalues.length; i++) {
      if (this.hashvalues[i] === other.hashvalues[i]) shared++;
    }
    return shared / this.hashvalues.length;
  }
}

interface RandomishGenerator {
  randInt(): number;
}
function RandomishGenerator({
  seed = 1,
}: {
  seed?: number;
  maxValue?: number;
}) {
  let current: number = seed;
  return {
    randInt() {
      const x = Math.sin(current++) * MAX_HASH;
      return Math.floor((x - Math.floor(x)) * MAX_HASH);
    },
  };
}

function sampleListOfUniqueInts(
  count: number = 128,
  random: RandomishGenerator,
): number[] {
  const seen = new Set<number>();
  const nums: number[] = [];
  while (nums.length < count) {
    const num = random.randInt();
    if (!seen.has(num)) {
      nums.push(num);
      seen.add(num);
    }
  }
  return nums;
}

/**
 * LshIndex class for indexing Minhash signatures.
 * Locality-Sensitive Hashing (LSH) is used to group similar items.
 */
export class LshIndex {
  private bandSize: number;
  private index: { [key: string]: string[] };

  constructor(args?: { bandSize?: number }) {
    const defaultArgs = { bandSize: 4 };
    const { bandSize } = { ...defaultArgs, ...args };
    this.bandSize = bandSize;
    this.index = {};
  }

  /**
   * Inserts a key and its corresponding minhash into the index.
   */
  public insert(key: string, minhash: Minhash): void {
    const hashbands = this.getHashbands(minhash);
    hashbands.forEach((band) => {
      if (Array.isArray(this.index[band])) {
        this.index[band].push(key);
      } else {
        this.index[band] = [key];
      }
    });
  }

  /**
   * Queries the index with a minhash and returns matching keys.
   */
  public query(minhash: Minhash): string[] {
    const matches: { [key: string]: boolean } = {};
    const hashbands = this.getHashbands(minhash);
    hashbands.forEach((band) => {
      (this.index[band] || []).forEach((key) => {
        matches[key] = true;
      });
    });
    return Object.keys(matches);
  }

  /**
   * Generates hash bands from a minhash.
   * This is used in LSH to bucket similar items together.
   */
  private getHashbands(minhash: Minhash): string[] {
    if (minhash["hashbands"]) return minhash["hashbands"];
    const hashbands: string[] = [];
    for (let i = 0; i < minhash.hashvalues.length / this.bandSize; i++) {
      const start = i * this.bandSize;
      const end = start + this.bandSize;
      const band = minhash.hashvalues.slice(start, end);
      hashbands.push(band.join("."));
    }
    minhash["hashbands"] = hashbands;
    return hashbands;
  }
}

/**
 * Hashes every string to a 32-bit integer.
 * This is a simple hash function to convert strings into numerical values.
 */
export function hashStrings(str: string[]): number[] {
  const hash = [];
  for (let i = 0; i < str.length; i++) {
    hash[i] = 0;
    for (let j = 0; j < str[i].length; j++) {
      const char = str[i].charCodeAt(j);
      hash[i] = (hash[i] << 5) - hash[i] + char;
      hash[i] |= 0; // Converts to a 32-bit integer
    }
    hash[i] += MAX_HASH;
  }
  return hash;
}
