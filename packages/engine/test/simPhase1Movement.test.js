import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

function botMovedEvents(replay, botId) {
  return replay.events.flat().filter((e) => e?.type === 'BOT_MOVED' && e.botId === botId)
}

test('runMatchToReplay: MOVE_TO_TARGET_UNTIL_IN_RANGE sets a persistent goal that self-clears at range', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 8,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: ['TARGET_CLOSEST', 'MOVE_TO_TARGET_UNTIL_IN_RANGE 136', 'WAIT 5'].join('\n'),
        loadout: [null, null, null],
      },
      { slotId: 'BOT2', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'NOP', loadout: [null, null, null] },
    ],
  })

  const moved = botMovedEvents(replay, 'BOT1')
  assert.equal(moved.length, 2, 'expected BOT1 to move only until it reaches the requested range')
})

test('runMatchToReplay: MOVE_AWAY_FROM_TARGET_UNTIL_RANGE no-ops when already far enough', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 6,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: ['TARGET_CLOSEST', 'MOVE_AWAY_FROM_TARGET_UNTIL_RANGE 100', 'WAIT 4'].join('\n'),
        loadout: [null, null, null],
      },
      { slotId: 'BOT2', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'NOP', loadout: [null, null, null] },
    ],
  })

  assert.equal(botMovedEvents(replay, 'BOT1').length, 0, 'expected no movement when the bot is already beyond range')
})

test('runMatchToReplay: ORBIT_TARGET adds tangential movement around the current bot target', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 6,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: ['SET_TARGET BOT3', 'ORBIT_TARGET', 'WAIT 4'].join('\n'),
        loadout: [null, null, null],
      },
      { slotId: 'BOT2', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'NOP', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'NOP', loadout: [null, null, null] },
    ],
  })

  const moved = botMovedEvents(replay, 'BOT1')
  assert.ok(moved.length > 0, 'expected BOT1 to move while orbiting')
  assert.ok(moved[0].toPos.x > moved[0].fromPos.x, 'expected the first orbit move to include a lateral component')
})
