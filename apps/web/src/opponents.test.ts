import { selectDistinctFromPool, selectOpponents } from './opponents'

describe('selectOpponents', () => {
  it('returns 3 distinct opponent ids', () => {
    const picked = selectOpponents(12345)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
  })

  it('is deterministic given a seed', () => {
    const a = selectOpponents(12345)
    const b = selectOpponents(12345)
    expect(a).toEqual(b)
  })
})

describe('selectDistinctFromPool', () => {
  it('selects 3 distinct ids from a mixed pool deterministically', () => {
    const pool = ['bot1', 'my-bot-2', 'my-bot-3'] as const

    const pickedA = selectDistinctFromPool(12345, pool, 3)
    const pickedB = selectDistinctFromPool(12345, pool, 3)

    expect(pickedA).toEqual(pickedB)
    expect(pickedA).toHaveLength(3)
    expect(new Set(pickedA).size).toBe(3)

    // Stable snapshot for this algorithm + pool ordering.
    expect(pickedA).toEqual(['my-bot-2', 'bot1', 'my-bot-3'])
  })
})
