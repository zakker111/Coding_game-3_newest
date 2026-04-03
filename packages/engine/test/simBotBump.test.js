import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { botsOverlap, oppositeDir } from '../src/sim/arenaMath.js'
import { BOT_BUMP_DAMAGE } from '../src/sim/constants.js'

test('runMatchToReplay: bot bumps are paired, deal damage, and alive bots never overlap', () => {
  const bots = [
    { slotId: 'BOT1', sourceText: 'LABEL LOOP\nMOVE RIGHT\nGOTO LOOP\n' },
    { slotId: 'BOT2', sourceText: 'LABEL LOOP\nMOVE LEFT\nGOTO LOOP\n' },
    { slotId: 'BOT3', sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
    { slotId: 'BOT4', sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 30, bots })

  const bumps = replay.events
    .flat()
    .filter((e) => e && e.type === 'BUMP_BOT')

  assert.ok(bumps.length > 0, 'expected at least one BUMP_BOT event')

  const bumpDamage = replay.events
    .flat()
    .filter((e) => e && e.type === 'DAMAGE' && e.kind === 'BUMP_BOT')

  assert.ok(bumpDamage.length > 0, 'expected at least one BUMP_BOT damage event')

  for (const e of bumpDamage) {
    assert.equal(e.amount, BOT_BUMP_DAMAGE)
    assert.ok(typeof e.sourceBotId === 'string')
    assert.notEqual(e.sourceBotId, e.victimBotId)
  }

  // Ensure bot-to-bot bump damage is applied at most once per bot-pair per tick.
  for (let t = 1; t < replay.events.length; t++) {
    const tickDamage = replay.events[t].filter((e) => e && e.type === 'DAMAGE' && e.kind === 'BUMP_BOT')

    /** @type {Map<string, number>} */
    const countByPairKey = new Map()

    for (const e of tickDamage) {
      const key = e.sourceRef?.id
      assert.ok(typeof key === 'string', `expected bump damage at t=${t} to have sourceRef.id`)
      countByPairKey.set(key, (countByPairKey.get(key) ?? 0) + 1)
    }

    for (const [key, count] of countByPairKey) {
      assert.equal(count, 2, `expected exactly 2 BUMP_BOT damage events at t=${t} for pair ${key}`)
    }
  }

  // Expect the colliding bots to have taken at least some damage.
  const end = replay.state[replay.tickCap]
  const b1 = end.bots.find((b) => b.botId === 'BOT1')
  const b2 = end.bots.find((b) => b.botId === 'BOT2')
  assert.ok(b1 && b1.hp < 100, 'expected BOT1 hp to decrease from bump damage')
  assert.ok(b2 && b2.hp < 100, 'expected BOT2 hp to decrease from bump damage')

  for (let t = 1; t < replay.events.length; t++) {
    const tickBumps = replay.events[t].filter((e) => e && e.type === 'BUMP_BOT')

    for (const e of tickBumps) {
      assert.ok(
        tickBumps.some(
          (o) => o.botId === e.otherBotId && o.otherBotId === e.botId && o.dir === oppositeDir(e.dir)
        ),
        `expected BUMP_BOT at t=${t} between ${e.botId} and ${e.otherBotId} to have an opposite-dir pair`
      )
    }
  }

  for (const s of replay.state) {
    const alive = s.bots.filter((b) => b.alive)

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        assert.ok(
          !botsOverlap(alive[i].pos, alive[j].pos),
          `expected alive bots to never overlap at t=${s.t} (${alive[i].botId} vs ${alive[j].botId})`
        )
      }
    }
  }
})
