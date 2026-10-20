/** mulberry32: a small, fast PRNG. The same seed always gives the same numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = {
  /** A number in [0, 1). */
  next(): number;
  /** An integer from min to max, both included. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
};

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    weighted(items, weight) {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= weight(item);
        if (roll < 0) return item;
      }
      return items[items.length - 1]!;
    },
  };
}
