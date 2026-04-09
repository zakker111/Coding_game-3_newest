import {
  ARENA_MAX,
  ARENA_MIN,
  BOT_HALF_SIZE,
  GRENADE_DAMAGE_ADJACENT,
  GRENADE_DAMAGE_CENTER,
  GRENADE_FUSE_TICKS,
  GRENADE_SPEED_UNITS_PER_TICK,
  GRENADE_TTL_TICKS,
  SLOT_IDS,
} from './constants.js'
import { clonePos, normalizeToLen, normalizeToMaxAxis, sectorFromPos } from './arenaMath.js'

export function createGrenade(shooter, target) {
  const dx = target.pos.x - shooter.pos.x
  const dy = target.pos.y - shooter.pos.y

  const vel = normalizeToLen(dx, dy, GRENADE_SPEED_UNITS_PER_TICK)
  const muzzleOffset = normalizeToMaxAxis(dx, dy, BOT_HALF_SIZE + 2)

  const spawn = {
    x: shooter.pos.x + muzzleOffset.x,
    y: shooter.pos.y + muzzleOffset.y,
  }

  return {
    grenadeId: '',
    ownerBotId: shooter.botId,
    pos: {
      x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, spawn.x)),
      y: Math.max(ARENA_MIN, Math.min(ARENA_MAX, spawn.y)),
    },
    vel,
    fuse: GRENADE_FUSE_TICKS,
    ttl: GRENADE_TTL_TICKS,
  }
}

export function stepGrenades(grenades, bots, tickEvents) {
  /** @type {typeof grenades} */
  const next = []

  for (const grenade of grenades) {
    const fromPos = clonePos(grenade.pos)
    const candidateTo = {
      x: grenade.pos.x + grenade.vel.x,
      y: grenade.pos.y + grenade.vel.y,
    }

    const toPos = {
      x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, candidateTo.x)),
      y: Math.max(ARENA_MIN, Math.min(ARENA_MAX, candidateTo.y)),
    }

    if (toPos.x !== candidateTo.x || toPos.y !== candidateTo.y) {
      grenade.vel = { x: 0, y: 0 }
    }

    tickEvents.push({
      type: 'GRENADE_MOVE',
      grenadeId: grenade.grenadeId,
      fromPos,
      toPos,
    })

    grenade.pos = toPos
    grenade.fuse--
    grenade.ttl--

    if (grenade.fuse <= 0) {
      explodeGrenade(grenade, bots, tickEvents)
      continue
    }

    if (grenade.ttl <= 0) {
      tickEvents.push({
        type: 'GRENADE_DESPAWN',
        grenadeId: grenade.grenadeId,
        reason: 'TTL',
        pos: clonePos(grenade.pos),
      })
      continue
    }

    next.push(grenade)
  }

  return next
}

function explodeGrenade(grenade, bots, tickEvents) {
  const centerSector = sectorFromPos(grenade.pos)

  tickEvents.push({
    type: 'GRENADE_EXPLODE',
    grenadeId: grenade.grenadeId,
    ownerBotId: grenade.ownerBotId,
    pos: clonePos(grenade.pos),
    sector: centerSector,
  })

  for (const botId of SLOT_IDS) {
    const bot = botsById(bots, botId)
    if (!bot || !bot.alive) continue
    if (bot.botId === grenade.ownerBotId) continue

    const victimSector = sectorFromPos(bot.pos)
    let damage = 0
    if (victimSector === centerSector) damage = GRENADE_DAMAGE_CENTER
    else if (isAdjSector(centerSector, victimSector)) damage = GRENADE_DAMAGE_ADJACENT
    if (damage <= 0) continue

    if (bot.armorEquipped) damage = damage - Math.floor(damage / 3)

    bot.lastDamageByBotId = grenade.ownerBotId
    bot.hp = Math.max(0, bot.hp - damage)

    tickEvents.push({
      type: 'DAMAGE',
      victimBotId: bot.botId,
      amount: damage,
      source: 'GRENADE',
      sourceBotId: grenade.ownerBotId,
      kind: 'EXPLOSION',
      sourceRef: { type: 'GRENADE', id: grenade.grenadeId },
    })

    if (bot.hp <= 0 && bot.alive) {
      bot.alive = false
      tickEvents.push({
        type: 'BOT_DIED',
        victimBotId: bot.botId,
        creditedBotId: bot.lastDamageByBotId,
      })
    }
  }

  tickEvents.push({
    type: 'GRENADE_DESPAWN',
    grenadeId: grenade.grenadeId,
    reason: 'EXPLODED',
    pos: clonePos(grenade.pos),
  })
}

function isAdjSector(a, b) {
  if (a === b) return false

  const ax = ((a - 1) % 3) + 1
  const ay = Math.floor((a - 1) / 3) + 1
  const bx = ((b - 1) % 3) + 1
  const by = Math.floor((b - 1) / 3) + 1

  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1
}

function botsById(bots, botId) {
  switch (botId) {
    case 'BOT1':
      return bots[0]
    case 'BOT2':
      return bots[1]
    case 'BOT3':
      return bots[2]
    case 'BOT4':
      return bots[3]
    default:
      return null
  }
}
