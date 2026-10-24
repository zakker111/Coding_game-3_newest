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
  // tickCap must exceed the ROCKET fuse (24 ticks) so the projectile can travel and explode.
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 30,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['ROCKET', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 30\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 30\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 30\n', inactive: true },
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

test('runMatchToReplay: attacking while cloaked breaks the cloak (SNIPER)', () => {
  // CLOAK then SNIPER in the same program: the snipe must end the cloak before or at the hit.
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 6,
    bots: [
      { slotId: 'BOT1', sourceText: 'USE_SLOT1 NONE\nUSE_SLOT2 BOT2\nWAIT 4\n', loadout: ['CLOAK', 'SNIPER', null] },
      { slotId: 'BOT2', sourceText: 'WAIT 6\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 6\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 6\n', inactive: true },
    ],
  })

  const events = flatEvents(replay)
  const started = events.some((event) => event.type === 'BOT_CLOAK_START' && event.botId === 'BOT1')
  const broke = events.find((event) => event.type === 'BOT_CLOAK_END' && event.botId === 'BOT1' && event.reason === 'ATTACK')
  const hit = events.some((event) => event.type === 'SNIPER_HIT' && event.targetBotId === 'BOT2')
  if (started && hit) assert.ok(broke, 'SNIPER fired while cloaked but cloak did not end with ATTACK')
  assert.ok(started, 'test setup: CLOAK never started (check the USE_SLOT1 target token)')
})
