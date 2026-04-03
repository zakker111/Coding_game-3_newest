function hashSeedToU32(seed) {
  if (typeof seed === 'number') return seed >>> 0

  // FNV-1a 32-bit
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic PRNG with stable results across JS runtimes.
 * Returns a function that yields floats in [0, 1).
 */
export function createRng(seed) {
  let a = hashSeedToU32(seed)

  return function rng() {
    // Mulberry32
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngInt(rng, minInclusive, maxInclusive) {
  const r = rng()
  return minInclusive + Math.floor(r * (maxInclusive - minInclusive + 1))
}

export function rngChoice(rng, items) {
  return items[rngInt(rng, 0, items.length - 1)]
}
