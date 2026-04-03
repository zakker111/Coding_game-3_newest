import {
  ARENA_MAX,
  ARENA_MIN,
  BOT_HALF_SIZE,
  BULLET_DAMAGE,
  BULLET_TTL_TICKS,
  BULLET_SPEED_UNITS_PER_TICK,
  SLOT_IDS,
} from './constants.js'
import { bresenhamPoints } from './bresenham.js'
import { clonePos, normalizeToLen, normalizeToMaxAxis, pointInBotAabb } from './arenaMath.js'



export function createBullet(shooter, target) {
  const dx = target.pos.x - shooter.pos.x
  const dy = target.pos.y - shooter.pos.y

  // Ruleset.md §5.1: Euclidean normalization (direction locked at fire time).
  const vel = normalizeToLen(dx, dy, BULLET_SPEED_UNITS_PER_TICK)

  // Visual + collision quality: spawn bullets from the shooter "muzzle" rather than
  // from the bot center, to avoid immediate overlap and to match player expectations.
  //
  // Important: this offset must be outside the shooter's 16x16 AABB even diagonally.
  // To achieve that, use an L∞ normalization for the muzzle offset.
  const muzzleOffset = normalizeToMaxAxis(dx, dy, BOT_HALF_SIZE + 2)

  const spawn = {
    x: shooter.pos.x + muzzleOffset.x,
    y: shooter.pos.y + muzzleOffset.y,
  }

  // Keep the spawn point inside the arena bounds (the step loop will handle wall hits).
  const pos = {
    x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, spawn.x)),
    y: Math.max(ARENA_MIN, Math.min(ARENA_MAX, spawn.y)),
  }

  return {
    bulletId: '',
    ownerBotId: shooter.botId,
    pos,
    vel,
    ttl: BULLET_TTL_TICKS,
  }
}

export function stepBullets(bullets, bots, tickEvents) {
  /** @type {typeof bullets} */
  const next = []

  for (const bullet of bullets) {
    const fromPos = clonePos(bullet.pos)
    const candidateTo = {
      x: bullet.pos.x + bullet.vel.x,
      y: bullet.pos.y + bullet.vel.y,
    }

    const path = bresenhamPoints(fromPos, candidateTo)

    /** @type {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number} } | { kind: 'BOT', pos: {x:number,y:number}, victim: any }} */
    let hit = { kind: 'NONE' }

    for (const p of path) {
      if (p.x < ARENA_MIN || p.x > ARENA_MAX || p.y < ARENA_MIN || p.y > ARENA_MAX) {
        hit = {
          kind: 'WALL',
          pos: {
            x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, p.x)),
            y: Math.max(ARENA_MIN, Math.min(ARENA_MAX, p.y)),
          },
        }
        break
      }

      for (const botId of SLOT_IDS) {
        const bot = botsById(bots, botId)
        if (!bot || !bot.alive) continue
        if (bot.botId === bullet.ownerBotId) continue

        if (pointInBotAabb(bot.pos, p)) {
          hit = { kind: 'BOT', pos: clonePos(p), victim: bot }
          break
        }
      }

      if (hit.kind !== 'NONE') break
    }

    const toPos = hit.kind === 'NONE' ? clonePos(candidateTo) : clonePos(hit.pos)

    tickEvents.push({
      type: 'BULLET_MOVE',
      bulletId: bullet.bulletId,
      fromPos,
      toPos,
    })

    if (hit.kind === 'BOT') {
      const victim = hit.victim

      let damage = victim.shieldActive ? BULLET_DAMAGE - Math.floor(BULLET_DAMAGE / 2) : BULLET_DAMAGE
      if (victim.armorEquipped) damage = damage - Math.floor(damage / 3)

      tickEvents.push({
        type: 'BULLET_HIT',
        bulletId: bullet.bulletId,
        victimBotId: victim.botId,
        damage,
        hitPos: clonePos(hit.pos),
      })

      victim.lastDamageByBotId = bullet.ownerBotId
      victim.hp = Math.max(0, victim.hp - damage)

      tickEvents.push({
        type: 'DAMAGE',
        victimBotId: victim.botId,
        amount: damage,
        source: 'BULLET',
        sourceBotId: bullet.ownerBotId,
        kind: 'DIRECT',
        sourceRef: { type: 'BULLET', id: bullet.bulletId },
      })

      if (victim.hp <= 0 && victim.alive) {
        victim.alive = false
        tickEvents.push({
          type: 'BOT_DIED',
          victimBotId: victim.botId,
          creditedBotId: victim.lastDamageByBotId,
        })
      }

      tickEvents.push({
        type: 'BULLET_DESPAWN',
        bulletId: bullet.bulletId,
        reason: 'HIT',
        pos: clonePos(hit.pos),
      })

      continue
    }

    if (hit.kind === 'WALL') {
      tickEvents.push({
        type: 'BULLET_DESPAWN',
        bulletId: bullet.bulletId,
        reason: 'WALL',
        pos: clonePos(hit.pos),
      })
      continue
    }

    // no collisions
    bullet.pos = toPos
    bullet.ttl--

    if (bullet.ttl <= 0) {
      tickEvents.push({
        type: 'BULLET_DESPAWN',
        bulletId: bullet.bulletId,
        reason: 'TTL',
        pos: clonePos(toPos),
      })
      continue
    }

    next.push(bullet)
  }

  return next
}

/**
 * @param {any[]} bots
 * @param {'BOT1'|'BOT2'|'BOT3'|'BOT4'} botId
 */
function botsById(bots, botId) {
  // All bot arrays are stored in SLOT_IDS order; prefer a constant-time mapping.
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
