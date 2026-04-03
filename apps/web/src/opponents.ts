import { EXAMPLE_OPPONENT_IDS, type ExampleBotId } from './exampleBots'

export type ExampleOpponentId = Exclude<ExampleBotId, 'bot0'>

function createRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * Deterministically selects `count` distinct ids from a provided pool.
 *
 * The selection depends on both `seed` and the pool order.
 */
export function selectDistinctFromPool<T extends string>(seed: number, pool: readonly T[], count: number): T[] {
  if (count <= 0) return []
  if (pool.length < count) {
    throw new Error(`Not enough opponents (${pool.length}) for count=${count}`)
  }

  const rng = createRng(seed)
  const arr = [...pool]

  // Deterministic Fisher–Yates shuffle.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr.slice(0, count)
}

/**
 * Deterministically selects `count` distinct opponent ids from the example pool (bot1..bot6).
 */
export function selectOpponents(seed: number, count = 3): ExampleOpponentId[] {
  return selectDistinctFromPool(seed, EXAMPLE_OPPONENT_IDS, count)
}
