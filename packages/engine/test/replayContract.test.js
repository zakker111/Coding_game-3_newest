import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

test('replay contract: header/state shape matches the documented 0.2.0 schema', () => {
  const replay = runMatchToReplay({
    seed: 7,
    tickCap: 5,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: 'WAIT 1\n',
        loadout: ['GRENADE', 'LASER', 'BULLET'],
      },
      {
        slotId: 'BOT2',
        sourceText: 'WAIT 1\n',
      },
    ],
  })

  assert.equal(replay.schemaVersion, '0.2.0')
  assert.equal(replay.rulesetVersion, '0.2.0')
  assert.deepStrictEqual(
    replay.bots.map((bot) => bot.slotId),
    SLOT_IDS,
    'expected replay header bots in stable BOT1..BOT4 order',
  )

  const bot1 = replay.bots[0]
  assert.deepStrictEqual(bot1.loadout, ['GRENADE', null, null])
  assert.deepStrictEqual(bot1.loadoutIssues, [
    { kind: 'UNKNOWN_MODULE', slot: 2, module: 'LASER' },
    { kind: 'MULTI_WEAPON', slot: 3, module: 'BULLET' },
  ])

  for (const bot of replay.bots.slice(1)) {
    assert.deepStrictEqual(bot.loadout, [null, null, null], `expected default-empty loadout for ${bot.slotId}`)
    assert.equal('loadoutIssues' in bot, false, `expected no loadoutIssues field for clean ${bot.slotId}`)
  }

  assert.equal(replay.state[0].t, 0)
  assert.deepStrictEqual(replay.events[0], [])
  assert.equal(replay.state.length, replay.tickCap + 1)
  assert.equal(replay.events.length, replay.tickCap + 1)

  for (const snap of replay.state) {
    assert.equal(snap.bots.length, 4, `expected 4 bots in state[t=${snap.t}]`)
    assert.ok(Array.isArray(snap.bullets), `expected bullets array in state[t=${snap.t}]`)
    assert.ok(
      snap.grenades == null || Array.isArray(snap.grenades),
      `expected grenades to be omitted or an array in state[t=${snap.t}]`,
    )
    for (const bot of snap.bots) {
      assert.ok(SLOT_IDS.includes(bot.botId), `unexpected botId in state[t=${snap.t}]: ${bot.botId}`)
      assert.equal(
        Object.prototype.hasOwnProperty.call(bot, 'targetBulletId'),
        true,
        `expected targetBulletId field in state[t=${snap.t}] for ${bot.botId}`,
      )
      assert.ok(
        bot.targetBulletId == null || typeof bot.targetBulletId === 'string',
        `expected targetBulletId to be string|null in state[t=${snap.t}] for ${bot.botId}`,
      )
    }
  }
})
