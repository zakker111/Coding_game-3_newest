import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: inactive slots start dead and do not participate', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 20,
    bots: [
      { slotId: 'BOT1', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
    inactiveSlots: ['BOT2', 'BOT3', 'BOT4'],
  })

  const initialState = replay.state[0]
  const bot1 = initialState.bots.find((bot) => bot.botId === 'BOT1')
  const bot2 = initialState.bots.find((bot) => bot.botId === 'BOT2')
  const bot3 = initialState.bots.find((bot) => bot.botId === 'BOT3')
  const bot4 = initialState.bots.find((bot) => bot.botId === 'BOT4')

  assert.equal(bot1?.alive, true)
  assert.equal(bot2?.alive, false)
  assert.equal(bot3?.alive, false)
  assert.equal(bot4?.alive, false)
  assert.equal(bot2?.hp, 0)
  assert.equal(bot3?.ammo, 0)
  assert.equal(bot4?.energy, 0)

  const anyInactiveExec = replay.events.flat().some(
    (event) => event?.type === 'BOT_EXEC' && (event.botId === 'BOT2' || event.botId === 'BOT3' || event.botId === 'BOT4'),
  )
  assert.equal(anyInactiveExec, false)

  const endEvent = replay.events[replay.tickCap].find((event) => event?.type === 'MATCH_END')
  assert.ok(endEvent)
  assert.equal(endEvent.endReason, 'LAST_BOT_ALIVE')
})
