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

test('runMatchToReplay: damaged bot can seek and benefit from a HEALTH powerup', () => {
  const healthSeeker = `
LABEL LOOP
IF (HEALTH < 90 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
WAIT 1
GOTO LOOP
`.trim() + '\n'

  const shooter = `
;@slot1 BULLET
LABEL LOOP
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT1
GOTO LOOP
`.trim() + '\n'

  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 180,
    bots: [
      { slotId: 'BOT1', sourceText: healthSeeker, loadout: [null, null, null] },
      { slotId: 'BOT2', sourceText: shooter, loadout: ['BULLET', null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const pickups = replay.events.flat().filter((e) => e.type === 'POWERUP_PICKUP' && e.botId === 'BOT1' && e.powerupType === 'HEALTH')
  const deltas = replay.events.flat().filter((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'PICKUP_HEALTH')

  assert.ok(pickups.length >= 1, 'expected BOT1 to pick up a HEALTH powerup')
  assert.ok(deltas.some((e) => e.healthDelta > 0), 'expected HEALTH pickup to restore hp')
})

test('runMatchToReplay: bullet bot can consume ammo and refill from an AMMO powerup', () => {
  const ammoSeeker = `
;@slot1 BULLET
LABEL LOOP
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2
IF (POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
WAIT 1
GOTO LOOP
`.trim() + '\n'

  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 180,
    bots: [
      { slotId: 'BOT1', sourceText: ammoSeeker, loadout: ['BULLET', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const shotDeltas = replay.events.flat().filter((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'SHOOT')
  const ammoPickups = replay.events.flat().filter((e) => e.type === 'POWERUP_PICKUP' && e.botId === 'BOT1' && e.powerupType === 'AMMO')
  const ammoDeltas = replay.events.flat().filter((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'PICKUP_AMMO')

  assert.ok(shotDeltas.length >= 1, 'expected BOT1 to spend ammo by shooting')
  assert.ok(ammoPickups.length >= 1, 'expected BOT1 to pick up an AMMO powerup')
  assert.ok(ammoDeltas.some((e) => e.ammoDelta > 0), 'expected AMMO pickup to restore ammo')
})

test('runMatchToReplay: energy-using bot can drain energy and refill from an ENERGY powerup', () => {
  const energySeeker = `
;@slot1 SAW
;@slot2 SHIELD
LABEL LOOP
IF (SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (POWERUP_EXISTS(ENERGY)) DO TARGET_POWERUP ENERGY
IF (POWERUP_EXISTS(ENERGY)) DO MOVE_TO_TARGET
WAIT 1
GOTO LOOP
`.trim() + '\n'

  const replay = runMatchToReplay({
    seed: 2,
    tickCap: 180,
    bots: [
      { slotId: 'BOT1', sourceText: energySeeker, loadout: ['SAW', 'SHIELD', null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const drains = replay.events.flat().filter(
    (e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && (e.cause === 'SAW_DRAIN' || e.cause === 'SHIELD_DRAIN')
  )
  const energyPickups = replay.events.flat().filter((e) => e.type === 'POWERUP_PICKUP' && e.botId === 'BOT1' && e.powerupType === 'ENERGY')
  const energyDeltas = replay.events.flat().filter((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'PICKUP_ENERGY')

  assert.ok(drains.length >= 1, 'expected BOT1 to spend energy using SAW/SHIELD')
  assert.ok(energyPickups.length >= 1, 'expected BOT1 to pick up an ENERGY powerup')
  assert.ok(energyDeltas.some((e) => e.energyDelta > 0), 'expected ENERGY pickup to restore energy')
})
