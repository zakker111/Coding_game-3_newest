import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { REPAIR_DRONE_AMMO_COST, REPAIR_DRONE_HEAL_AMOUNT } from '../src/sim/constants.js'

function flatEvents(replay) {
  return replay.events.flat().filter(Boolean)
}

test('runMatchToReplay: REPAIR_DRONE spawns, drains energy, and heals the owner', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 20,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'LABEL LOOP\nIF (SLOT_READY(SLOT1) && DRONE_COUNT() == 0) DO USE_SLOT1 SELF\nGOTO LOOP\n',
        loadout: ['REPAIR_DRONE', null, null],
      },
      {
        slotId: 'BOT4',
        sourceText: 'LABEL LOOP\nIF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT1\nGOTO LOOP\n',
        loadout: ['BULLET', null, null],
      },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const events = flatEvents(replay)
  const spawnDelta = events.find((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'SPAWN_DRONE')
  const heal = events.find((e) => e.type === 'DRONE_HEAL' && e.ownerBotId === 'BOT1')

  assert.ok(events.some((e) => e.type === 'DRONE_SPAWN' && e.ownerBotId === 'BOT1'), 'expected repair drone spawn')
  assert.ok(heal, 'expected repair drone heal pulse')
  assert.equal(heal?.amount, REPAIR_DRONE_HEAL_AMOUNT, 'expected tuned repair amount per pulse')
  assert.equal(spawnDelta?.ammoDelta, -REPAIR_DRONE_AMMO_COST, 'expected tuned repair-drone ammo cost on spawn')
  assert.ok(
    events.some((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'DRONE_DRAIN' && e.energyDelta < 0),
    'expected repair drone energy drain',
  )
})

test('runMatchToReplay: STOP_SLOT dismisses active repair drones', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 8,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'USE_SLOT1 SELF\nWAIT 2\nSTOP_SLOT1\nWAIT 10\n',
        loadout: ['REPAIR_DRONE', null, null],
      },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  assert.ok(
    flatEvents(replay).some((e) => e.type === 'DRONE_DESPAWN' && e.ownerBotId === 'BOT1' && e.reason === 'STOP'),
    'expected STOP_SLOT1 to dismiss repair drone',
  )
})

test('runMatchToReplay: repair drones vanish when owner energy reaches zero', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 110,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'USE_SLOT1 SELF\nWAIT 200\n',
        loadout: ['REPAIR_DRONE', null, null],
      },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  assert.ok(
    flatEvents(replay).some((e) => e.type === 'DRONE_DESPAWN' && e.ownerBotId === 'BOT1' && e.reason === 'NO_ENERGY'),
    'expected repair drones to vanish at zero owner energy',
  )
})

test('runMatchToReplay: REPAIR_DRONE requires SELF target kind', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 2,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 NONE\nGOTO LOOP\n', loadout: ['REPAIR_DRONE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const invalidTarget = flatEvents(replay).find((e) => e.type === 'BOT_EXEC' && e.botId === 'BOT1' && e.reason === 'INVALID_TARGET_KIND')
  assert.ok(invalidTarget, 'expected repair drone placement with NONE target to no-op with INVALID_TARGET_KIND')
})

test('runMatchToReplay: bullets can destroy repair drones', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 20,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'LABEL LOOP\nIF (SLOT_READY(SLOT1) && DRONE_COUNT() == 0) DO USE_SLOT1 SELF\nGOTO LOOP\n',
        loadout: ['REPAIR_DRONE', null, null],
      },
      {
        slotId: 'BOT4',
        sourceText: 'LABEL LOOP\nIF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT1\nGOTO LOOP\n',
        loadout: ['BULLET', null, null],
      },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  assert.ok(flatEvents(replay).some((e) => e.type === 'DRONE_HIT' && e.ownerBotId === 'BOT1'), 'expected bullet hit on repair drone')
})
