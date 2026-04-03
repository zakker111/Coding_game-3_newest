import test from 'node:test'
import assert from 'node:assert/strict'

import { evalExpr } from '../src/dsl/evalExpr.js'

test('evalExpr: smoke test (HEALTH < 45 && POWERUP_EXISTS(HEALTH))', () => {
  const ctx = {
    vars: {
      HEALTH: 40,
    },
    powerups: new Set(['HEALTH']),
  }

  const r = evalExpr('HEALTH < 45 && POWERUP_EXISTS(HEALTH)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: short-circuit (0 == 1 && UNKNOWN()) does not call UNKNOWN()', () => {
  let calls = 0

  const ctx = {
    functions: {
      UNKNOWN() {
        calls++
        return true
      },
    },
  }

  const r = evalExpr('0 == 1 && UNKNOWN()', ctx)
  assert.deepStrictEqual(r, { ok: true, value: false })
  assert.equal(calls, 0)
})

test('evalExpr: BOT_ALIVE + unary !', () => {
  const ctx = {
    botsAlive: {
      BOT1: false,
    },
  }

  const r = evalExpr('!BOT_ALIVE(BOT1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: TIMER semantics (TIMER_DONE && !TIMER_ACTIVE)', () => {
  const ctx = {
    timers: {
      T1: 0,
    },
  }

  const r = evalExpr('TIMER_DONE(T1) && !TIMER_ACTIVE(T1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: SLOT_READY(SLOT1) uses token args', () => {
  const ctx = {
    slotReady(slot) {
      return slot === 1
    },
  }

  const r = evalExpr('SLOT_READY(SLOT1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: DIST_TO_CLOSEST_BOT returns an int', () => {
  const ctx = {
    distToClosestBot: 12,
  }

  const r = evalExpr('DIST_TO_CLOSEST_BOT() <= 12', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: extended built-ins (sector/zone/dist/powerups/bumps)', () => {
  const ctx = {
    sector: 1,
    zone: 2,
    botSectors: { BOT2: 1, BOT3: 2 },
    distsToBot: { BOT2: 5 },
    distToTargetBot: 7,
    hasTargetBullet: true,
    distToTargetBullet: 9,
    distToSector(sector) {
      return sector === 1 ? 0 : 999
    },
    distToSectorZone(sector, zone) {
      return sector === 1 && zone === 2 ? 11 : 999
    },
    distToClosestPowerup(type) {
      return type === 'HEALTH' ? 13 : 999
    },
    powerupInSector(type, sector, zoneOrNull) {
      if (type !== 'HEALTH') return false
      if (sector !== 1) return false
      if (zoneOrNull == null) return true
      return zoneOrNull === 0 || zoneOrNull === 2
    },
    distToArenaEdge: { UP: 3, DOWN: 4, LEFT: 5, RIGHT: 6 },

    bumpedWall: true,
    bumpedWallDir: 'UP',

    bumpedBot: true,
    bumpedBotId: 'BOT2',
    bumpedBotDir: 'LEFT',

    hasModule(slot) {
      return slot === 1
    },
    cooldownRemaining(slot) {
      return slot === 1 ? 2 : 0
    },
  }

  assert.deepStrictEqual(evalExpr('SECTOR() == 1 && ZONE() == 2', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('BOT_IN_SAME_SECTOR(BOT2)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('BOT_IN_ADJ_SECTOR(BOT3)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('DIST_TO_BOT(BOT2) == 5', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('DIST_TO_TARGET_BOT() == 7', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() == 9', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('DIST_TO_SECTOR(1) == 0', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('DIST_TO_SECTOR_ZONE(1, 2) == 11', ctx), { ok: true, value: true })

  assert.deepStrictEqual(evalExpr('DIST_TO_CLOSEST_POWERUP(HEALTH) == 13', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('POWERUP_IN_SECTOR(HEALTH, 1)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('POWERUP_IN_SECTOR_CENTER(HEALTH, 1)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('POWERUP_IN_ZONE(HEALTH, 1, 2)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('POWERUP_IN_SAME_SECTOR(HEALTH)', ctx), { ok: true, value: true })

  assert.deepStrictEqual(evalExpr('DIST_TO_ARENA_EDGE(UP) == 3 && DIST_TO_WALL(RIGHT) == 6', ctx), {
    ok: true,
    value: true,
  })

  assert.deepStrictEqual(evalExpr('BUMPED_WALL() && BUMPED_WALL_DIR(UP)', ctx), { ok: true, value: true })
  assert.deepStrictEqual(evalExpr('BUMPED_BOT() && BUMPED_BOT_IS(BOT2) && BUMPED_BOT_DIR(LEFT)', ctx), {
    ok: true,
    value: true,
  })

  assert.deepStrictEqual(evalExpr('HAS_MODULE(SLOT1) && COOLDOWN_REMAINING(SLOT1) == 2', ctx), {
    ok: true,
    value: true,
  })
})

test('evalExpr: unknown identifier returns {ok:false} (does not throw)', () => {
  assert.doesNotThrow(() => {
    const r = evalExpr('NOT_A_REAL_IDENTIFIER == 1', {})
    assert.equal(r.ok, false)
    assert.equal(r.error.code, 'UNKNOWN_IDENTIFIER')
  })
})
