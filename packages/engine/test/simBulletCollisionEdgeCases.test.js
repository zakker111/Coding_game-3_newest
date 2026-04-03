import test from 'node:test'
import assert from 'node:assert/strict'

import { stepBullets } from '../src/sim/bulletSim.js'
import { BULLET_TTL_TICKS, SLOT_IDS } from '../src/sim/constants.js'

function makeBot(botId, x, y, overrides = {}) {
  return {
    botId,
    slotId: botId,
    pos: { x, y },
    alive: true,
    hp: 100,
    shieldActive: false,
    armorEquipped: false,
    lastDamageByBotId: null,
    ...overrides,
  }
}

function makeBots(overrides = {}) {
  return SLOT_IDS.map((botId, index) => {
    const basePos = { x: 24 + index * 32, y: 24 + index * 32 }
    const patch = overrides[botId] ?? {}
    return makeBot(botId, basePos.x, basePos.y, patch)
  })
}

function makeBullet(overrides = {}) {
  return {
    bulletId: 'B1',
    ownerBotId: 'BOT1',
    pos: { x: 20, y: 50 },
    vel: { x: 16, y: 0 },
    ttl: BULLET_TTL_TICKS,
    ...overrides,
  }
}

function findEvent(events, type) {
  return events.find((event) => event?.type === type)
}

test('stepBullets: nearest bot collision wins when multiple bots overlap the segment', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 12, y: 50 } },
    BOT2: { pos: { x: 30, y: 50 } },
    BOT3: { pos: { x: 40, y: 50 } },
    BOT4: { pos: { x: 140, y: 140 } },
  })
  const bullet = makeBullet()
  const tickEvents = []

  const next = stepBullets([bullet], bots, tickEvents)

  assert.equal(next.length, 0, 'expected hit bullet to despawn')

  const move = findEvent(tickEvents, 'BULLET_MOVE')
  const hit = findEvent(tickEvents, 'BULLET_HIT')
  const despawn = findEvent(tickEvents, 'BULLET_DESPAWN')

  assert.deepEqual(move?.toPos, { x: 22, y: 50 }, 'expected BULLET_MOVE to stop at the nearest hit point')
  assert.equal(hit?.victimBotId, 'BOT2', 'expected the nearer bot to win the collision')
  assert.deepEqual(hit?.hitPos, { x: 22, y: 50 })
  assert.equal(despawn?.reason, 'HIT')
  assert.equal(bots[1].hp, 90, 'expected BOT2 to take bullet damage')
  assert.equal(bots[2].hp, 100, 'expected the farther bot to remain unharmed')
})

test('stepBullets: corner contact counts as a bot hit', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 8, y: 8 } },
    BOT2: { pos: { x: 40, y: 40 } },
    BOT3: { pos: { x: 140, y: 20 } },
    BOT4: { pos: { x: 160, y: 160 } },
  })
  const bullet = makeBullet({
    pos: { x: 16, y: 16 },
    vel: { x: 16, y: 16 },
  })
  const tickEvents = []

  stepBullets([bullet], bots, tickEvents)

  const hit = findEvent(tickEvents, 'BULLET_HIT')
  assert.equal(hit?.victimBotId, 'BOT2')
  assert.deepEqual(hit?.hitPos, { x: 32, y: 32 }, 'expected corner-touching segment to register a hit')
})

test('stepBullets: exact tie between bot collisions resolves by slot order', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 8, y: 30 } },
    BOT2: { pos: { x: 30, y: 30 } },
    BOT3: { pos: { x: 30, y: 30 } },
    BOT4: { pos: { x: 140, y: 140 } },
  })
  const bullet = makeBullet({
    pos: { x: 10, y: 30 },
    vel: { x: 16, y: 0 },
  })
  const tickEvents = []

  stepBullets([bullet], bots, tickEvents)

  const hit = findEvent(tickEvents, 'BULLET_HIT')
  assert.equal(hit?.victimBotId, 'BOT2', 'expected BOT2 to win an exact bot/bot tie')
  assert.equal(bots[1].hp, 90)
  assert.equal(bots[2].hp, 100)
})

test('stepBullets: exact wall and bot tie resolves to wall first', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 20, y: 50 } },
    BOT2: { pos: { x: 184, y: 50 } },
    BOT3: { pos: { x: 140, y: 20 } },
    BOT4: { pos: { x: 160, y: 160 } },
  })
  const bullet = makeBullet({
    pos: { x: 192, y: 50 },
    vel: { x: 16, y: 0 },
  })
  const tickEvents = []

  stepBullets([bullet], bots, tickEvents)

  const move = findEvent(tickEvents, 'BULLET_MOVE')
  const hit = findEvent(tickEvents, 'BULLET_HIT')
  const despawn = findEvent(tickEvents, 'BULLET_DESPAWN')

  assert.deepEqual(move?.toPos, { x: 192, y: 50 })
  assert.equal(hit, undefined, 'expected no bot hit when wall and bot collisions are simultaneous')
  assert.equal(despawn?.reason, 'WALL')
  assert.deepEqual(despawn?.pos, { x: 192, y: 50 })
  assert.equal(bots[1].hp, 100)
})
