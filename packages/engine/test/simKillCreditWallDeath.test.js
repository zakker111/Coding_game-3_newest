import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

// Wall bumps are no longer per-tick damage while a bot is pinned flush against
// a wall (see resolveMovement), so a wall-grind kill is not reachable in a short
// match. This test covers the same kill-credit rule with bullets instead: the
// bot that dealt the final damage must be credited with the kill.
test('runMatchToReplay: bullet death is credited to last damaging bot', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'FIRE_SLOT1 BOT2', 'WAIT 12', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: [null, null, null],
      sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n',
    },
    // BOT3 starts firing later, so it is the last bot to damage BOT2.
    {
      slotId: 'BOT3',
      loadout: ['BULLET', null, null],
      sourceText: ['WAIT 60', 'LABEL LOOP', 'FIRE_SLOT1 BOT2', 'WAIT 12', 'GOTO LOOP', ''].join('\n'),
    },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
  ]

  const params = { seed: 2, tickCap: 240, bots }

  const r1 = runMatchToReplay(params)
  const r2 = runMatchToReplay(params)
  assert.deepStrictEqual(r2, r1, 'expected deterministic replay output')

  const allEvents = r1.events.flat()

  const hitsOnBot2 = allEvents.filter(
    (e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2'
  )
  assert.ok(hitsOnBot2.length > 0, 'expected bullets to hit BOT2')

  const death = allEvents.find(
    (e) => e && e.type === 'BOT_DIED' && e.victimBotId === 'BOT2'
  )

  assert.ok(death, 'expected BOT2 to die within tickCap')
  assert.equal(death.creditedBotId, 'BOT3', 'expected BOT2 death to be credited to BOT3 (last damager)')
})
