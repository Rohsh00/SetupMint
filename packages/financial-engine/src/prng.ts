/**
 * Seeded Pseudorandom Number Generator using the Mulberry32 algorithm.
 * Guarantees 100% deterministic, reproducible pseudo-random numbers across all platforms.
 */
export class Mulberry32PRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number | string = 42) {
    if (typeof seed === 'string') {
      this.initialSeed = Mulberry32PRNG.stringToSeed(seed);
    } else {
      this.initialSeed = (seed >>> 0) || 1;
    }
    this.state = this.initialSeed;
  }

  /**
   * Hashes a string (e.g. strategy ID or name) into a deterministic 32-bit unsigned integer seed.
   * Uses 32-bit FNV-1a hash.
   */
  static stringToSeed(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) || 1;
  }

  /**
   * Resets the PRNG state back to its initial seed.
   */
  reset(): void {
    this.state = this.initialSeed;
  }

  /**
   * Returns the current internal 32-bit state.
   */
  getState(): number {
    return this.state;
  }

  /**
   * Generates a pseudo-random float between 0 (inclusive) and 1 (exclusive): [0, 1).
   */
  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random integer between min (inclusive) and max (inclusive): [min, max].
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      const temp = min;
      min = max;
      max = temp;
    }
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Randomly picks one item from an array.
   */
  pick<T>(items: readonly T[] | T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    const idx = Math.floor(this.nextFloat() * items.length);
    return items[idx];
  }

  /**
   * Returns true with the given probability (0.0 to 1.0).
   */
  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }
}
