import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { findClosestEnemyMine } from '../src/sim/runMatchToReplay.js'
import { MINE_COOLDOWN_TICKS } from '../src/sim/constants.js'

function flatEvents(replay) {
  return replay.events.flat().filter(Boolean)
}

test('runMatchToReplay: MINE places, arms, triggers on enemy entry, and detonates', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 30,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'LABEL LOOP\nMOVE_TO_SECTOR 3\nIF (SECTOR() == 3) DO USE_SLOT1 NONE\nGOTO LOOP\n',
        loadout: ['MINE', null, null],
      },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const events = flatEvents(replay)
  const placement = events.find((e) => e.type === 'MINE_PLACE')
  const detonation = events.find((e) => e.type === 'MINE_DETONATE')
  const placedMine = replay.state.flatMap((s) => s.mines ?? []).find((m) => m.mineId === placement?.mineId)

  assert.ok(events.some((e) => e.type === 'MINE_PLACE'), 'expected mine placement event')
  assert.ok(events.some((e) => e.type === 'MINE_ARMED'), 'expected mine armed event')
  assert.ok(events.some((e) => e.type === 'MINE_TRIGGER' && e.triggerBotId === 'BOT2'), 'expected enemy trigger event')
  assert.ok(events.some((e) => e.type === 'MINE_DETONATE'), 'expected mine detonation event')
  assert.ok(events.some((e) => e.type === 'DAMAGE' && e.source === 'MINE' && e.victimBotId === 'BOT2'), 'expected mine damage on BOT2')
  assert.ok(placement && placement.pos, 'expected mine placement event to record an exact world position')
  assert.ok(detonation && detonation.pos, 'expected mine detonation event to record an exact world position')
  assert.ok(placedMine && placedMine.pos, 'expected mine state to preserve an exact world position')
  assert.deepEqual(placement.pos, placedMine.pos, 'expected placed mine state to match the placement event position')
})

test('runMatchToReplay: mine detonation does not damage the owner', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 20,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 NONE\nWAIT 20\nGOTO LOOP\n', loadout: ['MINE', null, null] },
      { slotId: 'BOT2', sourceText: 'LABEL LOOP\nMOVE_TO_BOT BOT1\nGOTO LOOP\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const ownerDamage = flatEvents(replay).filter((e) => e.type === 'DAMAGE' && e.source === 'MINE' && e.victimBotId === 'BOT1')
  assert.equal(ownerDamage.length, 0, 'expected owner-safe mine explosion')
})

test('runMatchToReplay: MINE requires NONE target kind', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 2,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['MINE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const invalidTarget = flatEvents(replay).find((e) => e.type === 'BOT_EXEC' && e.botId === 'BOT1' && e.reason === 'INVALID_TARGET_KIND')
  assert.ok(invalidTarget, 'expected mine placement with bot target to no-op with INVALID_TARGET_KIND')
})

test('runMatchToReplay: MINE follow-up use respects a longer cooldown before another placement', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: MINE_COOLDOWN_TICKS + 6,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 NONE\nGOTO LOOP\n', loadout: ['MINE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const events = flatEvents(replay)
  const placements = events.filter((e) => e.type === 'MINE_PLACE' && e.ownerBotId === 'BOT1')
  const cooldownExec = events.find((e) => e.type === 'BOT_EXEC' && e.botId === 'BOT1' && e.reason === 'COOLDOWN')

  assert.ok(cooldownExec, 'expected follow-up mine use to hit cooldown before a second placement')
  assert.ok(placements.length >= 2, 'expected a second mine placement once the cooldown expires')
})

test('runMatchToReplay: TARGET_CLOSEST_MINE + MOVE_TO_TARGET are wired', () => {
  const replay = runMatchToReplay({
    seed: 2,
    tickCap: 18,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'LABEL LOOP\nUSE_SLOT1 NONE\nWAIT 10\nGOTO LOOP\n',
        loadout: ['MINE', null, null],
      },
      {
        slotId: 'BOT2',
        sourceText: 'LABEL LOOP\nTARGET_CLOSEST_MINE\nMOVE_TO_TARGET\nGOTO LOOP\n',
        loadout: [null, null, null],
      },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const anyBot2TargetMine = replay.state.some((tick) =>
    tick.bots.some((bot) => bot.botId === 'BOT2' && typeof bot.targetMineId === 'string' && bot.targetMineId.length > 0),
  )
  const anyBot2Move = flatEvents(replay).some((e) => e.type === 'BOT_MOVED' && e.botId === 'BOT2')

  assert.equal(anyBot2TargetMine, true)
  assert.equal(anyBot2Move, true)
})

test('findClosestEnemyMine tie-break stays numeric for mine ids >= 10', () => {
  const target = findClosestEnemyMine('BOT2', { x: 100, y: 100 }, [
    { mineId: 'M10', ownerBotId: 'BOT1', pos: { x: 101, y: 100 } },
    { mineId: 'M2', ownerBotId: 'BOT1', pos: { x: 99, y: 100 } },
    { mineId: 'M11', ownerBotId: 'BOT3', pos: { x: 100, y: 99 } },
  ])

  assert.equal(target?.mineId, 'M2')
})
