import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: wall-bump death is credited to last damaging bot', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['FIRE_SLOT1 BOT2', 'LABEL LOOP', 'WAIT 10', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: [null, null, null],
      sourceText: ['WAIT 5', 'LABEL LOOP', 'MOVE RIGHT', 'GOTO LOOP', ''].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
  ]

  const params = { seed: 2, tickCap: 120, bots }

  const r1 = runMatchToReplay(params)
  const r2 = runMatchToReplay(params)
  assert.deepStrictEqual(r2, r1, 'expected deterministic replay output')

  const allEvents = r1.events.flat()

  const sawBulletHit = allEvents.some(
    (e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2'
  )
  assert.ok(sawBulletHit, 'expected BOT1 to hit BOT2 with at least one bullet')

  const death = allEvents.find(
    (e) => e && e.type === 'BOT_DIED' && e.victimBotId === 'BOT2'
  )

  assert.ok(death, 'expected BOT2 to die within tickCap')
  assert.equal(death.creditedBotId, 'BOT1', 'expected BOT2 death to be credited to BOT1')
})
