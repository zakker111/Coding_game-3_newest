import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

// This test exists to guard the end-to-end wiring for powerup targeting + movement.
// (Bots should actually move toward spawned powerups and be able to pick them up.)

test('runMatchToReplay: bot can seek and pick up spawned powerups', () => {
  const seeker = `
LABEL LOOP

; Prefer any available powerup type (health -> ammo -> energy).
IF (POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (!POWERUP_EXISTS(HEALTH) && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
IF (!POWERUP_EXISTS(HEALTH) && !POWERUP_EXISTS(AMMO) && POWERUP_EXISTS(ENERGY)) DO SET_MOVE_TO_POWERUP ENERGY

; Commit for a tick so the goal can carry us while we aren't replanning.
WAIT 1
GOTO LOOP
`.trim() + '\n'

  const bots = [
    { slotId: 'BOT1', sourceText: seeker },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 123, tickCap: 120, bots })

  const pickups = replay.events.flat().filter((e) => e.type === 'POWERUP_PICKUP' && e.botId === 'BOT1')
  const resourceDeltas = replay.events.flat().filter((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1')
  assert.ok(pickups.length >= 1, 'expected BOT1 to pick up at least one powerup')
  assert.ok(
    resourceDeltas.every((e) => /^PICKUP_(HEALTH|AMMO|ENERGY)$/.test(e.cause)),
    'expected any pickup-driven RESOURCE_DELTA to use a typed PICKUP_* cause'
  )
})
