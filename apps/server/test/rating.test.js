import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RATING,
  DEFAULT_RATING_DEVIATION,
  ESTABLISHED_RATING_DEVIATION,
  PROVISIONAL_MATCHES,
  applyMatchesToRatings,
  applyPlacementsToRatings,
  glickoUpdate,
  ratingFields,
} from '../src/services/rating.js'

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Glicko paper example (Glicko, 1999): player 1500/200 beats 1400/30, loses to 1550/100 and 1700/300.
test('glickoUpdate matches the worked example from the Glicko paper', () => {
  const result = glickoUpdate(
    { rating: 1500, ratingDeviation: 200 },
    [
      { rating: 1400, ratingDeviation: 30, score: 1 },
      { rating: 1550, ratingDeviation: 100, score: 0 },
      { rating: 1700, ratingDeviation: 300, score: 0 },
    ]
  )
  assert.ok(Math.abs(result.rating - 1464.10) < 0.01, `rating was ${result.rating}`)
  assert.ok(Math.abs(result.ratingDeviation - 151.40) < 0.01, `rd was ${result.ratingDeviation}`)
})

test('an equal-rated win and loss move ratings by the same amount in opposite directions', () => {
  const placements = applyPlacementsToRatings(new Map(), [
    { botId: 'a', rank: 1 },
    { botId: 'b', rank: 2 },
  ])
  const a = placements.get('a')
  const b = placements.get('b')
  assert.ok(a.rating > DEFAULT_RATING)
  assert.ok(b.rating < DEFAULT_RATING)
  assert.ok(Math.abs(a.rating - DEFAULT_RATING - (DEFAULT_RATING - b.rating)) < 1e-9)
})

test('a 4-bot match ranks the winner up and the last place down, using pre-match ratings', () => {
  const next = applyPlacementsToRatings(new Map(), [
    { botId: 'p1', rank: 1 },
    { botId: 'p2', rank: 2 },
    { botId: 'p3', rank: 3 },
    { botId: 'p4', rank: 4 },
  ])
  assert.ok(next.get('p1').rating > next.get('p2').rating)
  assert.ok(next.get('p2').rating > next.get('p3').rating)
  assert.ok(next.get('p3').rating > next.get('p4').rating)
  // Input order must not matter.
  const reversed = applyPlacementsToRatings(new Map(), [
    { botId: 'p4', rank: 4 },
    { botId: 'p3', rank: 3 },
    { botId: 'p2', rank: 2 },
    { botId: 'p1', rank: 1 },
  ])
  for (const id of ['p1', 'p2', 'p3', 'p4']) {
    assert.ok(Math.abs(next.get(id).rating - reversed.get(id).rating) < 1e-9)
  }
})

test('new bots are provisional with high volatility, and volatility drops after the provisional period', () => {
  let states = new Map()
  const fresh = ratingFields(states.get('x'))
  assert.equal(fresh.rating, DEFAULT_RATING)
  assert.equal(fresh.provisional, true)
  assert.equal(fresh.ratingMatches, 0)

  const rdHistory = []
  for (let index = 0; index < PROVISIONAL_MATCHES + 2; index += 1) {
    states = applyPlacementsToRatings(states, [
      { botId: 'x', rank: 1 },
      { botId: 'y', rank: 2 },
    ])
    rdHistory.push(states.get('x').ratingDeviation)
  }
  assert.ok(rdHistory[0] < DEFAULT_RATING_DEVIATION, 'first match already reduces RD a little')
  assert.ok(rdHistory[PROVISIONAL_MATCHES - 1] <= ESTABLISHED_RATING_DEVIATION)
  assert.equal(ratingFields(states.get('x')).provisional, false)
  assert.equal(ratingFields(states.get('x')).ratingMatches, PROVISIONAL_MATCHES + 2)
})

test('ratingFields sanitizes missing or broken stored values', () => {
  const fields = ratingFields({ rating: 'high', ratingDeviation: -4, ratingMatches: 2.5 })
  assert.equal(fields.rating, DEFAULT_RATING)
  assert.equal(fields.ratingDeviation, DEFAULT_RATING_DEVIATION)
  assert.equal(fields.ratingMatches, 0)
  assert.equal(fields.provisional, true)
})

test('applyMatchesToRatings uses the slot-to-displayName mapping from the stored match', () => {
  const states = applyMatchesToRatings([
    {
      participants: [
        { slot: 'BOT1', displayName: 'ann/a' },
        { slot: 'BOT2', displayName: 'ben/b' },
      ],
      result: {
        placements: [
          { slot: 'BOT2', rank: 1 },
          { slot: 'BOT1', rank: 2 },
        ],
      },
    },
  ])
  assert.ok(states.get('ben/b').rating > DEFAULT_RATING)
  assert.ok(states.get('ann/a').rating < DEFAULT_RATING)
})

// Acceptance: the stronger bot must rise faster than the weaker one whether the daily field
// has 4 bots or 20. Seeded demo data: bot i has strength 100 - 5i and each match draws
// strength + seeded noise, so the result is the same on every run.
function seededDemoRuns({ fieldSize, runs, seed }) {
  const random = mulberry32(seed)
  const strengths = new Map()
  for (let index = 0; index < 20; index += 1) {
    strengths.set(`demo/bot${String(index).padStart(2, '0')}`, 100 - 5 * index)
  }
  const field = [...strengths.keys()].slice(0, fieldSize)

  let states = new Map()
  for (let run = 0; run < runs; run += 1) {
    const groups = []
    for (let a = 0; a < field.length; a += 1)
      for (let b = a + 1; b < field.length; b += 1)
        for (let c = b + 1; c < field.length; c += 1)
          for (let d = c + 1; d < field.length; d += 1) groups.push([field[a], field[b], field[c], field[d]])

    for (const group of groups) {
      const scored = group
        .map((botId) => ({ botId, score: strengths.get(botId) + (random() - 0.5) * 16 }))
        .sort((x, y) => y.score - x.score)
      states = applyPlacementsToRatings(
        states,
        scored.map((entry, index) => ({ botId: entry.botId, rank: index + 1 }))
      )
    }
  }
  return { field, states }
}

for (const fieldSize of [4, 20]) {
  test(`seeded demo: stronger bot rises faster than weaker bot with a ${fieldSize}-bot daily field`, () => {
    const { field, states } = seededDemoRuns({ fieldSize, runs: fieldSize === 4 ? 40 : 2, seed: 20260101 })
    const strongest = field[0]
    const weakest = field[field.length - 1]
    const strongRating = states.get(strongest).rating
    const weakRating = states.get(weakest).rating
    assert.ok(
      strongRating > weakRating + 50,
      `expected ${strongest} (${strongRating.toFixed(1)}) well above ${weakest} (${weakRating.toFixed(1)})`
    )
    assert.ok(strongRating > DEFAULT_RATING, 'strongest bot should end above the starting rating')
    assert.ok(weakRating < DEFAULT_RATING, 'weakest bot should end below the starting rating')
  })
}
