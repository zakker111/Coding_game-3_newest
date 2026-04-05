import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

function runCase(bot1) {
  return runMatchToReplay({
    seed: 1,
    tickCap: 3,
    bots: [
      { slotId: 'BOT1', ...bot1 },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })
}

function firstBotExec(replay) {
  return replay.events.flat().find((e) => e?.type === 'BOT_EXEC' && e.botId === 'BOT1')
}

test('runMatchToReplay: BOT_EXEC reason vocabulary stays stable for common no-op cases', () => {
  const invalidInstr = firstBotExec(
    runCase({ loadout: [null, null, null], sourceText: 'LABEL LOOP\nBOGUS\nGOTO LOOP\n' }),
  )
  assert.equal(invalidInstr?.result, 'NOP')
  assert.equal(invalidInstr?.reason, 'INVALID_INSTR')
  assert.equal(invalidInstr?.pcAfter, 1)

  const noModule = firstBotExec(
    runCase({ loadout: [null, null, null], sourceText: 'LABEL LOOP\nUSE_SLOT1 TARGET\nGOTO LOOP\n' }),
  )
  assert.equal(noModule?.reason, 'NO_MODULE')

  const noEffect = firstBotExec(
    runCase({ loadout: ['ARMOR', null, null], sourceText: 'LABEL LOOP\nUSE_SLOT1 TARGET\nGOTO LOOP\n' }),
  )
  assert.equal(noEffect?.reason, 'NO_EFFECT')

  const cooldownReplay = runCase({
    loadout: ['BULLET', null, null],
    sourceText: 'LABEL LOOP\nFIRE_SLOT1 BOT2\nFIRE_SLOT1 BOT2\nGOTO LOOP\n',
  })
  const cooldown = cooldownReplay.events.flat().find(
    (e) => e?.type === 'BOT_EXEC' && e.botId === 'BOT1' && e.reason === 'COOLDOWN',
  )
  assert.ok(cooldown, 'expected a cooldown-driven BOT_EXEC no-op')

  const invalidTargetKind = firstBotExec(
    runCase({ loadout: ['BULLET', null, null], sourceText: 'LABEL LOOP\nUSE_SLOT1 HEALTH\nGOTO LOOP\n' }),
  )
  assert.equal(invalidTargetKind?.reason, 'INVALID_TARGET_KIND')

  const invalidTarget = firstBotExec(
    runCase({ loadout: ['BULLET', null, null], sourceText: 'LABEL LOOP\nUSE_SLOT1 TARGET\nGOTO LOOP\n' }),
  )
  assert.equal(invalidTarget?.reason, 'INVALID_TARGET')
})
