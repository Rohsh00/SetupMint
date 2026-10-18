/**
 * Seeded Pseudorandom Number Generator using Mulberry32 algorithm.
 * Guarantees 100% deterministic, reproducible seed generation.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  /**
   * Generates a pseudo-random float between 0 (inclusive) and 1 (exclusive).
   */
  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a random integer between min (inclusive) and max (inclusive).
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Returns a random float rounded to specified decimals.
   */
  nextNumber(min: number, max: number, decimals: number = 2): number {
    const val = min + this.nextFloat() * (max - min);
    return Number(val.toFixed(decimals));
  }

  /**
   * Randomly picks one item from an array.
   */
  pick<T>(items: readonly T[] | T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const idx = Math.floor(this.nextFloat() * items.length);
    return items[idx];
  }

  /**
   * Randomly picks multiple unique items from an array.
   */
  pickMultiple<T>(items: readonly T[] | T[], count: number): T[] {
    const shuffled = [...items].sort(() => this.nextFloat() - 0.5);
    return shuffled.slice(0, Math.min(count, items.length));
  }

  /**
   * Returns true with the given probability (0.0 to 1.0).
   */
  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }
}
