import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: wall bumps deal damage', () => {
  const bots = [
    { slotId: 'BOT1', sourceText: 'LABEL LOOP\nMOVE LEFT\nGOTO LOOP\n' },
    { slotId: 'BOT2', sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
    { slotId: 'BOT3', sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
    { slotId: 'BOT4', sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 5, bots })

  const bumps = replay.events
    .flat()
    .filter((e) => e && e.type === 'BUMP_WALL' && e.botId === 'BOT1')

  assert.ok(bumps.length > 0, 'expected BOT1 to bump a wall at least once')
  assert.ok(
    bumps.some((e) => typeof e.damage === 'number' && e.damage > 0),
    'expected wall bumps to have damage > 0'
  )

  const hp0 = replay.state[0].bots.find((b) => b.botId === 'BOT1')?.hp
  const hpEnd = replay.state[replay.tickCap].bots.find((b) => b.botId === 'BOT1')?.hp

  assert.equal(typeof hp0, 'number')
  assert.equal(typeof hpEnd, 'number')
  assert.ok(hpEnd < hp0, 'expected BOT1 hp to decrease after wall bump(s)')
})
