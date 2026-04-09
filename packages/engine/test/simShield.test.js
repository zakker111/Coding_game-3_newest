import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { BULLET_DAMAGE } from '../src/sim/constants.js'

test('runMatchToReplay: SHIELD reduces bullet damage and drains energy', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: ['SHIELD', null, null],
      sourceText: ['LABEL LOOP', 'SHIELD ON', 'GOTO LOOP', ''].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 123, tickCap: 30, bots })

  const allEvents = replay.events.flat()

  const bulletHits = allEvents.filter((e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2')
  assert.ok(bulletHits.length > 0, 'expected at least one bullet hit on BOT2')

  // Regression anchor: BULLET_DAMAGE should be stable v1 and shield should mitigate by 50%.
  assert.equal(BULLET_DAMAGE, 10)
  assert.ok(bulletHits.every((e) => e.damage === 5), 'expected shield to reduce BULLET_HIT damage from 10 to 5')

  const shieldDrains = allEvents.filter((e) => e && e.type === 'RESOURCE_DELTA' && e.botId === 'BOT2' && e.cause === 'SHIELD_DRAIN')
  assert.ok(shieldDrains.length > 0, 'expected at least one SHIELD_DRAIN RESOURCE_DELTA for BOT2')
  assert.ok(
    shieldDrains.every((e) => e.energyDelta < 0 && e.ammoDelta === 0 && e.healthDelta === 0),
    'expected SHIELD_DRAIN to only decrease energy'
  )
  assert.ok(shieldDrains.every((e) => e.energyDelta === -2), 'expected shield to drain 2 energy per active tick')
})
