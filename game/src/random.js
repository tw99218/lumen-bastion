// A small seeded random source (mulberry32) so a fixed seed always replays
// the same game: the screenshot scenes and any replay depend on it.
// Everything that must be deterministic in the simulation draws from here;
// nothing in the world reads Math.random.

export function createRandom(seed) {
  const initial = (seed >>> 0) || 0x9e3779b9;
  let state = initial;
  return {
    /** Restore the stream to its first draw: a reset world replays exactly. */
    reset() { state = initial; },
    next() {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** A float in [min, max). */
    range(min, max) {
      return min + this.next() * (max - min);
    },
    /** An integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** One element of `items`, uniformly. */
    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    },
    /** True with probability `p`. */
    chance(p) {
      return this.next() < p;
    },
  };
}
