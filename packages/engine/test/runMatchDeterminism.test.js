import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: deterministic for same seed + bots', () => {
  const bots = [
    { slotId: 'BOT1', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]

  const params = { seed: 123, tickCap: 60, bots }

  const r1 = runMatchToReplay(params)
  const r2 = runMatchToReplay(params)

  assert.deepStrictEqual(r2, r1)
})
