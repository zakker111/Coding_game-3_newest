import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '../src/index.js'

function flatEvents(replay) {
  return replay.events.flat()
}

test('runMatchToReplay: SNIPER hits instantly through USE_SLOT', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 8,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['SNIPER', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 8\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 8\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 8\n', inactive: true },
    ],
  })

  assert.ok(flatEvents(replay).some((event) => event.type === 'SNIPER_HIT' && event.targetBotId === 'BOT2'))
  assert.ok(flatEvents(replay).some((event) => event.type === 'DAMAGE' && event.source === 'SNIPER'))
})

test('runMatchToReplay: ROCKET uses explosive projectile path', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 12,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['ROCKET', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 12\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 12\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 12\n', inactive: true },
    ],
  })

  assert.ok(flatEvents(replay).some((event) => event.type === 'ROCKET_SPAWN'))
  assert.ok(flatEvents(replay).some((event) => event.type === 'GRENADE_EXPLODE'))
})

test('runMatchToReplay: TELEPORT moves to sector target and spends energy', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 3,
    bots: [
      { slotId: 'BOT1', sourceText: 'USE_SLOT1 SECTOR_5\nWAIT 2\n', loadout: ['TELEPORT', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 3\n', inactive: true },
      { slotId: 'BOT3', sourceText: 'WAIT 3\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 3\n', inactive: true },
    ],
  })

  const teleport = flatEvents(replay).find((event) => event.type === 'BOT_TELEPORT')
  assert.ok(teleport)
  assert.deepStrictEqual(teleport.toPos, { x: 96, y: 96 })
  assert.ok(flatEvents(replay).some((event) => event.type === 'RESOURCE_DELTA' && event.cause === 'TELEPORT'))
})
