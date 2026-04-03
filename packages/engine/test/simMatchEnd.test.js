import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: 4 idle bots ends early by STALEMATE (deterministic)', () => {
  const bots = [
    { slotId: 'BOT1', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]

  const params = { seed: 123, tickCap: 200, bots }

  const a = runMatchToReplay(params)
  const b = runMatchToReplay(params)

  assert.deepStrictEqual(b, a, 'expected deterministic replay output')

  // Should end early due to stalemate rules.
  assert.equal(a.tickCap, 150)
  assert.equal(a.state.length, 150 + 1)
  assert.equal(a.events.length, 150 + 1)

  const endState = a.state[a.tickCap]
  assert.equal(
    endState.bots.filter((bot) => bot.alive).length,
    4,
    'expected all 4 idle bots to still be alive at stalemate'
  )

  const endEvent = a.events[a.tickCap].find((e) => e.type === 'MATCH_END')
  assert.ok(endEvent, 'expected a MATCH_END event on the final tick')
  assert.equal(endEvent.endReason, 'STALEMATE')
})
