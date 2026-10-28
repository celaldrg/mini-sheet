// Seeded random numbers so tests and demos are repeatable. Pure, no DOM.

/**
 * A small seeded generator (mulberry32) returning floats in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Integer in [min, max] from a generator.
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
