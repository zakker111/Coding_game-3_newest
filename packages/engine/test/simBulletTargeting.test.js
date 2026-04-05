import test from 'node:test'
import assert from 'node:assert/strict'

import { findClosestEnemyBullet, runMatchToReplay } from '../src/sim/runMatchToReplay.js'

const BOT_WITH_ARMOR = `;@slot1 EMPTY
;@slot2 ARMOR
;@slot3 EMPTY

;@name evader

LABEL LOOP
  TARGET_CLOSEST_BULLET
  MOVE_AWAY_FROM_TARGET
  GOTO LOOP
`

const BOT_SHOOTER = `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY

;@name shooter

LABEL LOOP
  SET_TARGET BOT2
  USE_SLOT1 TARGET
  WAIT 1
  GOTO LOOP
`

test('Phase 3: TARGET_CLOSEST_BULLET + MOVE_AWAY_FROM_TARGET are wired (smoke)', () => {
  const replay = runMatchToReplay({
    seed: 123,
    tickCap: 10,
    bots: [
      { slotId: 'BOT1', sourceText: BOT_SHOOTER, loadout: ['BULLET', null, null] },
      { slotId: 'BOT2', sourceText: BOT_WITH_ARMOR, loadout: [null, 'ARMOR', null] },
      { slotId: 'BOT3', sourceText: '', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: '', loadout: [null, null, null] },
    ],
  })

  assert.equal(replay.rulesetVersion, '0.2.0')
  assert.equal(replay.schemaVersion, '0.2.0')

  const anyBulletSpawn = replay.events.some((tick) => tick.some((e) => e?.type === 'BULLET_SPAWN'))
  assert.equal(anyBulletSpawn, true)

  // This is intentionally weak: we mainly want to ensure the new opcodes compile+execute.
  const anyBot2Move = replay.events.some((tick) => tick.some((e) => e?.type === 'BOT_MOVED' && e?.botId === 'BOT2'))
  assert.equal(anyBot2Move, true)

  const anyBot2TargetBullet = replay.state.some((tick) =>
    tick.bots.some((bot) => bot.botId === 'BOT2' && typeof bot.targetBulletId === 'string' && bot.targetBulletId.length > 0),
  )
  assert.equal(anyBot2TargetBullet, true)
})

test('Phase 3: TARGET_CLOSEST_BULLET tie-break stays numeric for bullet ids >= 10', () => {
  const target = findClosestEnemyBullet('BOT2', { x: 100, y: 100 }, [
    { bulletId: 'B10', ownerBotId: 'BOT1', pos: { x: 101, y: 100 } },
    { bulletId: 'B2', ownerBotId: 'BOT1', pos: { x: 99, y: 100 } },
    { bulletId: 'B11', ownerBotId: 'BOT3', pos: { x: 100, y: 99 } },
  ])

  assert.equal(target?.bulletId, 'B2')
})
