import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

function hpByBotId(state, botId) {
  return state.bots.find((b) => b.botId === botId)?.hp
}

function makeBots() {
  return [
    {
      slotId: 'BOT1',
      loadout: ['SAW', null, null],
      // Ensure BOT1 closes distance every tick (via persistent moveGoal), so SAW damage actually occurs.
      sourceText: ['LABEL LOOP', 'TARGET_CLOSEST', 'SET_MOVE_TO_TARGET', 'SAW ON', 'GOTO LOOP', ''].join('\n'),
    },
    // Keep BOT2 stationary at its spawn, so BOT1 can reliably reach SAW range.
    { slotId: 'BOT2', loadout: [null, null, null], sourceText: 'NOP\n' },
    {
      slotId: 'BOT3',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT4', 'GOTO LOOP', ''].join('\n'),
    },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]
}

test('runMatchToReplay: SAW drains energy and deals damage (hp decreases deterministically)', () => {
  const bots = makeBots()
  const replay = runMatchToReplay({ seed: 1337, tickCap: 20, bots })

  const allEvents = replay.events.flat()

  const sawExecs = allEvents.filter(
    (e) => e && e.type === 'BOT_EXEC' && e.botId === 'BOT1' && typeof e.instrText === 'string' && /^SAW\s+ON\b/i.test(e.instrText)
  )
  assert.ok(sawExecs.length > 0, 'expected at least one BOT_EXEC for SAW ON from BOT1')

  const drains = allEvents.filter((e) => e && e.type === 'RESOURCE_DELTA' && e.botId === 'BOT1' && e.cause === 'SAW_DRAIN')
  assert.ok(drains.length > 0, 'expected at least one SAW_DRAIN RESOURCE_DELTA for BOT1')
  assert.ok(
    drains.every((e) => e.energyDelta < 0 && e.ammoDelta === 0 && e.healthDelta === 0),
    'expected SAW_DRAIN to only decrease energy'
  )

  const sawDamages = allEvents.filter((e) => e && e.type === 'DAMAGE' && e.source === 'SAW' && e.sourceBotId === 'BOT1')
  assert.ok(sawDamages.length > 0, 'expected at least one SAW DAMAGE event from BOT1')

  assert.ok(sawDamages.every((e) => e.amount === 6), 'expected stable SAW damage amount of 6')
  assert.ok(sawDamages.every((e) => e.victimBotId === 'BOT2'), 'expected BOT2 to be the SAW victim in this setup')

  const hp0 = hpByBotId(replay.state[0], 'BOT2')
  const hpEnd = hpByBotId(replay.state[replay.tickCap], 'BOT2')

  assert.equal(hp0, 100)

  const totalSawDamage = sawDamages.reduce((n, e) => n + e.amount, 0)
  const totalDamageToBot2 = allEvents
    .filter((e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT2')
    .reduce((n, e) => n + e.amount, 0)

  assert.equal(totalSawDamage, 48, 'expected stable SAW damage total for this scenario')
  assert.equal(hpEnd, hp0 - totalDamageToBot2, 'expected BOT2 hp decrease to match summed DAMAGE events')
})

test('runMatchToReplay: SAW match is deterministic for same seed + bots', () => {
  const bots = makeBots()
  const params = { seed: 1337, tickCap: 20, bots }

  const a = runMatchToReplay(params)
  const b = runMatchToReplay(params)

  assert.deepStrictEqual(b, a, 'expected deterministic replay output')
})

test('runMatchToReplay: non-saw bot still produces BULLET_SPAWN', () => {
  const bots = makeBots()
  const replay = runMatchToReplay({ seed: 1337, tickCap: 20, bots })

  const allEvents = replay.events.flat()
  assert.ok(
    allEvents.some((e) => e && e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT3'),
    'expected a non-saw bot (BOT3) to spawn bullets'
  )
})
