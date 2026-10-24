import test from 'node:test'
import assert from 'node:assert/strict'
import { recomputeRatings, runRecompute } from '../src/tools/recomputeRatings.js'
import { DEFAULT_RATING } from '../src/services/rating.js'

function dailyMatch(id, createdAt, order) {
  // order: displayNames in rank order (best first)
  return {
    matchId: id,
    kind: 'daily',
    createdAt,
    participants: order.map((displayName, index) => ({ slot: `BOT${index + 1}`, displayName })),
    result: {
      placements: order.map((_, index) => ({ slot: `BOT${index + 1}`, rank: index + 1 })),
    },
  }
}

const MATCHES = [
  dailyMatch('m_1', '2026-01-01T03:00:00.000Z', ['a/strong', 'a/mid', 'a/weak', 'a/bad']),
  dailyMatch('m_2', '2026-01-01T03:00:01.000Z', ['a/mid', 'a/strong', 'a/bad', 'a/weak']),
  dailyMatch('m_3', '2026-01-02T03:00:00.000Z', ['a/strong', 'a/weak', 'a/mid', 'a/bad']),
]

test('recomputeRatings is independent of the order the stored matches come back in', () => {
  const forward = recomputeRatings(MATCHES)
  const shuffled = recomputeRatings([MATCHES[2], MATCHES[0], MATCHES[1]])
  assert.deepEqual([...shuffled.keys()].sort(), [...forward.keys()].sort())
  for (const [botId, state] of forward) {
    assert.equal(shuffled.get(botId).rating, state.rating, botId)
    assert.equal(shuffled.get(botId).ratingMatches, state.ratingMatches, botId)
  }
})

test('recomputeRatings ignores non-daily matches and matches without a result', () => {
  const states = recomputeRatings([
    ...MATCHES,
    { ...MATCHES[0], matchId: 'm_sandbox', kind: 'sandbox' },
    { ...MATCHES[0], matchId: 'm_pending', result: null },
  ])
  assert.equal(states.get('a/strong').ratingMatches, 3)
  assert.equal(states.get('a/bad').ratingMatches, 3)
})

test('recomputeRatings ranks the bot that placed first highest across the stored matches', () => {
  const states = recomputeRatings(MATCHES)
  assert.ok(states.get('a/strong').rating > states.get('a/mid').rating)
  assert.ok(states.get('a/mid').rating > states.get('a/weak').rating)
  assert.ok(states.get('a/weak').rating > states.get('a/bad').rating)
  assert.ok(states.get('a/bad').rating < DEFAULT_RATING)
})

test('runRecompute dry run writes nothing; a real run writes ratings to every ranked bot', () => {
  const bots = [
    { botId: 'a/strong', ownerUsername: 'a', name: 'strong' },
    { botId: 'a/mid', ownerUsername: 'a', name: 'mid' },
    { botId: 'a/weak', ownerUsername: 'a', name: 'weak' },
    { botId: 'a/bad', ownerUsername: 'a', name: 'bad' },
    { botId: 'a/idle', ownerUsername: 'a', name: 'idle' },
    { botId: 'builtin/example', ownerUsername: 'builtin', name: 'example' },
  ]
  const writes = []
  const database = {
    matchStore: {
      listMatches({ kind }) {
        assert.equal(kind, 'daily')
        return MATCHES
      },
    },
    botStore: {
      listBots: () => bots,
      updateRankedStatus(owner, name, patch) {
        writes.push({ owner, name, patch })
        return {}
      },
    },
  }

  const dry = runRecompute({ database, dryRun: true })
  assert.equal(writes.length, 0)
  assert.equal(dry.written, false)
  assert.equal(dry.rows.length, 5, 'builtin bots are not ranked')
  assert.equal(dry.rows[0].botId, 'a/strong')
  assert.equal(dry.rows.find((row) => row.botId === 'a/idle').rating, DEFAULT_RATING)

  const real = runRecompute({ database, dryRun: false })
  assert.equal(real.written, true)
  assert.equal(writes.length, 5)
  const strong = writes.find((write) => write.name === 'strong')
  assert.equal(strong.patch.ratingMatches, 3)
  assert.equal(typeof strong.patch.rating, 'number')
  assert.equal(typeof strong.patch.ratingDeviation, 'number')
})
