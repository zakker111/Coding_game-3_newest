import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { ARENA_MAX, ARENA_MIN, BULLET_SPEED_UNITS_PER_TICK } from '../src/sim/constants.js'

function assertFiniteArenaPos(pos, msg) {
  assert.ok(Number.isFinite(pos?.x), `${msg}: expected finite x`)
  assert.ok(Number.isFinite(pos?.y), `${msg}: expected finite y`)
  assert.ok(pos.x >= ARENA_MIN && pos.x <= ARENA_MAX, `${msg}: expected x within arena bounds`)
  assert.ok(pos.y >= ARENA_MIN && pos.y <= ARENA_MAX, `${msg}: expected y within arena bounds`)
}

test('runMatchToReplay: bullets despawn and ammo only decreases via SHOOT', () => {
  const bots = [
    { slotId: 'BOT1', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    {
      slotId: 'BOT2',
      loadout: ['BULLET', null, null],
      sourceText: [
        '; fire repeatedly (subject to cooldown)',
        'LABEL LOOP',
        'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT1',
        'GOTO LOOP',
        '',
      ].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 4242, tickCap: 120, bots })

  /** @type {Map<string, number>} */
  const spawnTickByBulletId = new Map()

  /** @type {Map<string, {tick: number, reason: string}>} */
  const despawnByBulletId = new Map()

  /** @type {Map<number, Set<string>>} */
  const bulletIdsInStateByTick = new Map()

  for (const s of replay.state) {
    bulletIdsInStateByTick.set(s.t, new Set(s.bullets.map((b) => b.bulletId)))
  }

  for (let t = 1; t < replay.events.length; t++) {
    for (const e of replay.events[t]) {
      if (e.type === 'BULLET_SPAWN') {
        spawnTickByBulletId.set(e.bulletId, t)

        // Regression guard: bullet velocity must not overspeed diagonally.
        const v2 = e.vel.x * e.vel.x + e.vel.y * e.vel.y
        assert.ok(
          v2 <= BULLET_SPEED_UNITS_PER_TICK * BULLET_SPEED_UNITS_PER_TICK,
          `expected bullet speed^2 <= ${BULLET_SPEED_UNITS_PER_TICK ** 2}, got ${v2} (vel=${e.vel.x},${e.vel.y})`
        )
      }

      if (e.type === 'BULLET_DESPAWN') {
        despawnByBulletId.set(e.bulletId, { tick: t, reason: e.reason })
        assertFiniteArenaPos(e.pos, `expected BULLET_DESPAWN.pos to be finite and in bounds for ${e.bulletId} at t=${t}`)
        assert.ok(['WALL', 'TTL', 'HIT'].includes(e.reason), 'expected BULLET_DESPAWN.reason to be WALL/TTL/HIT')
        const bulletIdsInState = bulletIdsInStateByTick.get(t)
        assert.ok(bulletIdsInState && !bulletIdsInState.has(e.bulletId), 'expected despawned bullet to be absent in end-of-tick state')
      }

      if (e.type === 'BULLET_MOVE') {
        assertFiniteArenaPos(e.fromPos, `expected BULLET_MOVE.fromPos to be finite and in bounds for ${e.bulletId} at t=${t}`)
        assertFiniteArenaPos(e.toPos, `expected BULLET_MOVE.toPos to be finite and in bounds for ${e.bulletId} at t=${t}`)
      }

      if (e.type === 'BULLET_HIT') {
        assertFiniteArenaPos(e.hitPos, `expected BULLET_HIT.hitPos to be finite and in bounds for ${e.bulletId} at t=${t}`)
      }

      if (e.type === 'RESOURCE_DELTA' && e.ammoDelta < 0) {
        assert.equal(e.cause, 'SHOOT', 'expected ammo decreases to be caused by SHOOT')
        assert.equal(e.ammoDelta, -1, 'expected shoot ammo delta to be -1')
      }
    }
  }

  assert.ok(spawnTickByBulletId.size > 0, 'expected at least one bullet to be spawned')

  const lifetimes = []

  for (const [bulletId, spawnTick] of spawnTickByBulletId) {
    const d = despawnByBulletId.get(bulletId)
    if (!d) continue
    assert.ok(d.tick >= spawnTick, 'expected despawn tick to be at/after spawn tick')
    assert.ok(['WALL', 'TTL', 'HIT'].includes(d.reason), 'expected despawn reason to be WALL/TTL/HIT')
    lifetimes.push(d.tick - spawnTick)
  }

  assert.ok(lifetimes.length > 0, 'expected at least one bullet despawn to be observed')

  const maxObservedLifetime = Math.max(...lifetimes)

  for (const [bulletId, spawnTick] of spawnTickByBulletId) {
    const d = despawnByBulletId.get(bulletId)

    // Bullets spawned near the end of the replay may still be alive at tickCap.
    // Ensure that any bullet that has had enough time to despawn actually did.
    if (!d) {
      const endTickBullets = bulletIdsInStateByTick.get(replay.tickCap)
      assert.ok(endTickBullets && endTickBullets.has(bulletId), 'expected non-despawned bullet to still be present at end-of-replay')

      assert.ok(
        replay.tickCap - spawnTick <= maxObservedLifetime + 2,
        `expected bullet ${bulletId} spawned at t=${spawnTick} to despawn within replay window`
      )
      continue
    }

    for (let t = d.tick; t <= replay.tickCap; t++) {
      const bulletIdsInState = bulletIdsInStateByTick.get(t)
      assert.ok(bulletIdsInState && !bulletIdsInState.has(bulletId), `expected bullet ${bulletId} to be absent from state at tick ${t}`)
    }
  }

  // Stronger ammo invariant: any observed ammo decrease for BOT2 must coincide with a BULLET_SPAWN.
  for (let t = 1; t < replay.state.length; t++) {
    const prevAmmo = replay.state[t - 1].bots.find((b) => b.botId === 'BOT2')?.ammo
    const nextAmmo = replay.state[t].bots.find((b) => b.botId === 'BOT2')?.ammo
    assert.ok(typeof prevAmmo === 'number' && typeof nextAmmo === 'number')

    if (nextAmmo < prevAmmo) {
      const tickEvents = replay.events[t]
      assert.ok(tickEvents.some((e) => e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT2'))
      assert.ok(
        tickEvents.some((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT2' && e.ammoDelta === nextAmmo - prevAmmo && e.cause === 'SHOOT')
      )
    }
  }
})
