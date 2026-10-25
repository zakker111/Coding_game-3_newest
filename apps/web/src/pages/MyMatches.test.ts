import { describe, expect, it } from 'vitest'

import { buildRows, replayLinkFor } from './MyMatches'
import type { ServerDailyRunMatch } from '../serverClient'

function match(overrides: Partial<ServerDailyRunMatch>): ServerDailyRunMatch {
  return {
    matchId: 'm1',
    kind: 'daily',
    status: 'complete',
    matchSeed: 1,
    tickCap: 100,
    result: null,
    participants: [
      { slot: 'BOT1', displayName: 'alice/bot1', sourceHash: 'a' },
      { slot: 'BOT2', displayName: 'bob/bot2', sourceHash: 'b' },
    ],
    ...overrides,
  }
}

describe('MyMatches buildRows', () => {
  it('shows the player placement points and win flag', () => {
    const rows = buildRows(
      [
        match({
          matchId: 'm1',
          result: {
            endReason: 'last-alive',
            winnerSlot: 'BOT1',
            placements: [
              { slot: 'BOT1', rank: 1, points: 3, alive: true, hp: 10, ammo: 5, energy: 5 },
              { slot: 'BOT2', rank: 2, points: 0, alive: false, hp: 0, ammo: 0, energy: 0 },
            ],
          },
        }),
      ],
      'alice',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ slot: 'BOT1', rank: 1, points: 3, won: true })
  })

  it('reports null points for a match without placements and skips matches the player is not in', () => {
    const rows = buildRows(
      [
        match({ matchId: 'm2', result: null }),
        match({
          matchId: 'm3',
          participants: [{ slot: 'BOT1', displayName: 'carol/bot1', sourceHash: 'c' }],
        }),
      ],
      'alice',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ points: null, won: false, rank: null })
    expect(rows[0].match.matchId).toBe('m2')
  })
})

describe('replayLinkFor', () => {
  it('points at the Workshop deep link with the match and the player slot', () => {
    expect(replayLinkFor('abc 1', 'BOT2')).toBe('/workshop?replayMatch=abc%201&slot=BOT2')
  })
})
