/** Seeded, deterministic RNG. No Math.random() anywhere in game logic (CLAUDE.md §2). */

/** Hashes a string into a 32-bit unsigned seed (xmur3-derived). Deterministic across platforms. */
export function hashStringToSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: small, fast, good-enough-for-games PRNG. Returns a function yielding floats in [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = typeof seed === 'string' ? hashStringToSeed(seed) : seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  /** Float in [0, 1). */
  next() {
    return this._next();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], inclusive both ends. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    if (arr.length === 0) return undefined;
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher-Yates shuffle; returns a new array, does not mutate input. */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Weighted pick: entries is [{ item, weight }]. */
  weighted(entries) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return entries[entries.length - 1].item;
  }
}

/**
 * Manages independent, deterministically-derived RNG streams by name
 * (e.g. "floorgen", "drops", "items", "ai") off one master seed, so that
 * consuming one stream never perturbs another.
 */
export class RngStreams {
  constructor(masterSeed) {
    this.masterSeed = masterSeed;
    this._streams = new Map();
  }

  stream(name) {
    if (!this._streams.has(name)) {
      const subSeed = hashStringToSeed(`${this.masterSeed}:${name}`);
      this._streams.set(name, new Rng(subSeed));
    }
    return this._streams.get(name);
  }

  reset() {
    this._streams.clear();
  }
}
