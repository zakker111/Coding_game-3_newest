import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '../src/index.js'
import { summarizeBotMatch } from '@coding-game/replay'

test('summarizeBotMatch: victim sees first hit, attacker, and the tick with most damage', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 12,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['SNIPER', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 12\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 12\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 12\n', inactive: true },
    ],
  })

  const summary = summarizeBotMatch(replay, 'BOT2')
  assert.ok(summary.totalDamageTaken > 0)
  assert.equal(summary.firstDamageTaken.attackerBotId, 'BOT1')
  assert.equal(summary.firstDamageTaken.source, 'SNIPER')
  assert.ok(summary.mostDamageTick.amount >= summary.firstDamageTaken.amount)
  assert.ok(summary.mostDamageTick.tick >= summary.firstDamageTaken.tick)
  assert.equal(summary.lastInstructions.length, 5)
  assert.ok(summary.lastInstructions.every((entry) => entry.tick >= 1 && entry.tick <= 12))
  assert.ok(summary.lastInstructions[4].tick > summary.lastInstructions[0].tick)

  const attacker = summarizeBotMatch(replay, 'BOT1')
  assert.equal(attacker.totalDamageTaken, 0)
  assert.equal(attacker.firstDamageTaken, null)
  assert.ok(attacker.totalDamageDealt > 0)
})

test('summarizeBotMatch: bot that never gets hit reports no damage and survives', () => {
  const replay = runMatchToReplay({
    seed: 7,
    tickCap: 5,
    bots: [
      { slotId: 'BOT1', sourceText: 'WAIT 5\n', loadout: [null, null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 5\n', inactive: true },
      { slotId: 'BOT3', sourceText: 'WAIT 5\n', inactive: true },
      { slotId: 'BOT4', sourceText: 'WAIT 5\n', inactive: true },
    ],
  })
  const summary = summarizeBotMatch(replay, 'BOT1')
  assert.equal(summary.totalDamageTaken, 0)
  assert.equal(summary.mostDamageTick, null)
  assert.equal(summary.died, null)
  assert.equal(summary.survivedToEnd, true)
})
