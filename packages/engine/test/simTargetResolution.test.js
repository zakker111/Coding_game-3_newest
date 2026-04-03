import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { BOT_HALF_SIZE } from '../src/sim/constants.js'

test('runMatchToReplay: TARGET_CLOSEST is resolved at set time (does not change as bots move)', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      // Tick1: pick target; Tick2: shoot stored TARGET.
      sourceText: ['TARGET_CLOSEST', 'FIRE_SLOT1 TARGET', ''].join('\n'),
    },
    { slotId: 'BOT2', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    // BOT3 moves closer to BOT1 after tick1, so if TARGET were re-resolved at
    // shoot-time, the shot would incorrectly go to BOT3.
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'MOVE UP\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 3, bots })

  const spawnsT2 = replay.events[2].filter((e) => e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT1')
  assert.equal(spawnsT2.length, 1, 'expected exactly one BOT1 bullet spawn at tick 2')
  assert.equal(spawnsT2[0].targetBotId, 'BOT2', 'expected BOT1 to shoot the BOT2 chosen on tick 1')

  // Regression: bullets should spawn from the shooter muzzle (outside the bot center)
  // and start moving on the same tick they are spawned.
  const bot1PosT1 = replay.state[1].bots.find((b) => b.botId === 'BOT1')?.pos
  assert.ok(bot1PosT1, 'expected BOT1 state at t=1')

  const spawn = spawnsT2[0]
  assert.ok(
    spawn.pos.x >= bot1PosT1.x + BOT_HALF_SIZE,
    `expected bullet spawn x (${spawn.pos.x}) to be at least BOT_HALF_SIZE ahead of bot center x (${bot1PosT1.x})`
  )

  const movesT2 = replay.events[2].filter((e) => e.type === 'BULLET_MOVE' && e.bulletId === spawn.bulletId)
  assert.equal(movesT2.length, 1, 'expected bullet to move on the same tick it spawns')
})
