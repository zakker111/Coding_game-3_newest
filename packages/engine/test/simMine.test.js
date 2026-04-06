import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

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

  assert.ok(events.some((e) => e.type === 'MINE_PLACE'), 'expected mine placement event')
  assert.ok(events.some((e) => e.type === 'MINE_ARMED'), 'expected mine armed event')
  assert.ok(events.some((e) => e.type === 'MINE_TRIGGER' && e.triggerBotId === 'BOT2'), 'expected enemy trigger event')
  assert.ok(events.some((e) => e.type === 'MINE_DETONATE'), 'expected mine detonation event')
  assert.ok(events.some((e) => e.type === 'DAMAGE' && e.source === 'MINE' && e.victimBotId === 'BOT2'), 'expected mine damage on BOT2')
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
