import {
  ARENA_MAX,
  ARENA_MIN,
  BOT_HALF_SIZE,
  BULLET_DAMAGE,
  BULLET_TTL_TICKS,
  BULLET_SPEED_UNITS_PER_TICK,
  REPAIR_DRONE_HALF_SIZE,
  SLOT_IDS,
} from './constants.js'
import { clonePos, normalizeToLen, normalizeToMaxAxis } from './arenaMath.js'

const COLLISION_EPSILON = 1e-9



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

export function stepBullets(bullets, bots, dronesOrTickEvents, maybeTickEvents) {
  const legacySignature = !Array.isArray(maybeTickEvents)
  const drones = Array.isArray(maybeTickEvents) ? dronesOrTickEvents : []
  const tickEvents = Array.isArray(maybeTickEvents) ? maybeTickEvents : dronesOrTickEvents
  /** @type {typeof bullets} */
  const next = []
  /** @type {typeof drones} */
  let nextDrones = drones

  for (const bullet of bullets) {
    const fromPos = clonePos(bullet.pos)
    const candidateTo = {
      x: bullet.pos.x + bullet.vel.x,
      y: bullet.pos.y + bullet.vel.y,
    }

    const hit = findFirstBulletCollision({ fromPos, toPos: candidateTo, ownerBotId: bullet.ownerBotId }, bots, nextDrones)

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

    if (hit.kind === 'DRONE') {
      nextDrones = nextDrones.filter((drone) => drone.droneId !== hit.drone.droneId)

      tickEvents.push({
        type: 'DRONE_HIT',
        droneId: hit.drone.droneId,
        ownerBotId: hit.drone.ownerBotId,
        bulletId: bullet.bulletId,
        sourceBotId: bullet.ownerBotId,
      })

      tickEvents.push({
        type: 'DRONE_DESPAWN',
        droneId: hit.drone.droneId,
        ownerBotId: hit.drone.ownerBotId,
        reason: 'HIT',
        pos: clonePos(hit.pos),
      })

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

  return legacySignature ? next : { bullets: next, drones: nextDrones }
}

/**
 * Resolve the earliest collision along the continuous bullet segment for this tick.
 *
 * Tie-breaks are explicit:
 * - lower segment travel distance wins
 * - exact ties prefer WALL over BOT
 * - exact BOT ties resolve by SLOT_IDS order
 *
 * This keeps collision winner selection independent from rasterization order while
 * preserving stable, integer-valued replay/event positions.
 *
 * @param {{ fromPos: {x:number,y:number}, toPos: {x:number,y:number}, ownerBotId: string }} params
 * @param {any[]} bots
 * @param {any[]} drones
 * @returns {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number}, t: number } | { kind: 'BOT', pos: {x:number,y:number}, t: number, victim: any } | { kind: 'DRONE', pos: {x:number,y:number}, t: number, drone: any }}
 */
function findFirstBulletCollision(params, bots, drones) {
  const { fromPos, toPos, ownerBotId } = params

  /** @type {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number}, t: number } | { kind: 'BOT', pos: {x:number,y:number}, t: number, victim: any } | { kind: 'DRONE', pos: {x:number,y:number}, t: number, drone: any }} */
  let winner = findFirstWallCollision(fromPos, toPos)

  for (const botId of SLOT_IDS) {
    const bot = botsById(bots, botId)
    if (!bot || !bot.alive) continue
    if (bot.botId === ownerBotId) continue

    winner = compareCollisionCandidates(winner, findFirstBotCollision(fromPos, toPos, bot))
  }

  for (const drone of drones) {
    if (drone.ownerBotId === ownerBotId) continue
    winner = compareCollisionCandidates(winner, findFirstDroneCollision(fromPos, toPos, drone))
  }

  return winner
}

/**
 * @param {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number}, t: number } | { kind: 'BOT', pos: {x:number,y:number}, t: number, victim: any } | { kind: 'DRONE', pos: {x:number,y:number}, t: number, drone: any }} current
 * @param {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number}, t: number } | { kind: 'BOT', pos: {x:number,y:number}, t: number, victim: any } | { kind: 'DRONE', pos: {x:number,y:number}, t: number, drone: any }} candidate
 */
function compareCollisionCandidates(current, candidate) {
  if (current.kind === 'NONE') return candidate
  if (candidate.kind === 'NONE') return current

  if (candidate.t < current.t - COLLISION_EPSILON) return candidate
  if (current.t < candidate.t - COLLISION_EPSILON) return current

  if (current.kind !== candidate.kind) return current.kind === 'WALL' ? current : candidate
  if (current.kind === 'BOT' && candidate.kind === 'BOT') {
    return SLOT_IDS.indexOf(candidate.victim.botId) < SLOT_IDS.indexOf(current.victim.botId) ? candidate : current
  }

  if (current.kind === 'DRONE' && candidate.kind === 'DRONE') {
    return candidate.drone.droneId < current.drone.droneId ? candidate : current
  }

  if (current.kind === 'DRONE') return current
  if (candidate.kind === 'DRONE') return candidate
  return current
}

/**
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @returns {{ kind: 'NONE' } | { kind: 'WALL', pos: {x:number,y:number}, t: number }}
 */
function findFirstWallCollision(fromPos, toPos) {
  const range = intersectSegmentWithRect(fromPos, toPos, {
    minX: ARENA_MIN,
    maxX: ARENA_MAX,
    minY: ARENA_MIN,
    maxY: ARENA_MAX,
  })

  if (!range) {
    return {
      kind: 'WALL',
      pos: quantizePointOnSegment(fromPos, toPos, 0, {
        minX: ARENA_MIN,
        maxX: ARENA_MAX,
        minY: ARENA_MIN,
        maxY: ARENA_MAX,
      }),
      t: 0,
    }
  }

  if (range.tExit >= 1 - COLLISION_EPSILON) return { kind: 'NONE' }

  return {
    kind: 'WALL',
    pos: quantizePointOnSegment(fromPos, toPos, range.tExit, {
      minX: ARENA_MIN,
      maxX: ARENA_MAX,
      minY: ARENA_MIN,
      maxY: ARENA_MAX,
    }),
    t: range.tExit,
  }
}

/**
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @param {any} bot
 * @returns {{ kind: 'NONE' } | { kind: 'BOT', pos: {x:number,y:number}, t: number, victim: any }}
 */
function findFirstBotCollision(fromPos, toPos, bot) {
  const bounds = {
    minX: bot.pos.x - BOT_HALF_SIZE,
    maxX: bot.pos.x + BOT_HALF_SIZE,
    minY: bot.pos.y - BOT_HALF_SIZE,
    maxY: bot.pos.y + BOT_HALF_SIZE,
  }

  const range = intersectSegmentWithRect(fromPos, toPos, bounds)
  if (!range) return { kind: 'NONE' }

  const t = Math.max(0, range.tEnter)

  return {
    kind: 'BOT',
    pos: quantizePointOnSegment(fromPos, toPos, t, bounds),
    t,
    victim: bot,
  }
}

/**
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @param {any} drone
 * @returns {{ kind: 'NONE' } | { kind: 'DRONE', pos: {x:number,y:number}, t: number, drone: any }}
 */
function findFirstDroneCollision(fromPos, toPos, drone) {
  const bounds = {
    minX: drone.pos.x - REPAIR_DRONE_HALF_SIZE,
    maxX: drone.pos.x + REPAIR_DRONE_HALF_SIZE,
    minY: drone.pos.y - REPAIR_DRONE_HALF_SIZE,
    maxY: drone.pos.y + REPAIR_DRONE_HALF_SIZE,
  }

  const range = intersectSegmentWithRect(fromPos, toPos, bounds)
  if (!range) return { kind: 'NONE' }

  const t = Math.max(0, range.tEnter)

  return {
    kind: 'DRONE',
    pos: quantizePointOnSegment(fromPos, toPos, t, bounds),
    t,
    drone,
  }
}

/**
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @returns {{ tEnter: number, tExit: number } | null}
 */
function intersectSegmentWithRect(fromPos, toPos, bounds) {
  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y

  let tEnter = 0
  let tExit = 1

  if (!clipRange(-dx, fromPos.x - bounds.minX, (nextEnter, nextExit) => {
    tEnter = nextEnter
    tExit = nextExit
  }, tEnter, tExit)) return null
  if (!clipRange(dx, bounds.maxX - fromPos.x, (nextEnter, nextExit) => {
    tEnter = nextEnter
    tExit = nextExit
  }, tEnter, tExit)) return null
  if (!clipRange(-dy, fromPos.y - bounds.minY, (nextEnter, nextExit) => {
    tEnter = nextEnter
    tExit = nextExit
  }, tEnter, tExit)) return null
  if (!clipRange(dy, bounds.maxY - fromPos.y, (nextEnter, nextExit) => {
    tEnter = nextEnter
    tExit = nextExit
  }, tEnter, tExit)) return null

  return { tEnter, tExit }
}

/**
 * @param {number} p
 * @param {number} q
 * @param {(nextEnter:number, nextExit:number) => void} update
 * @param {number} tEnter
 * @param {number} tExit
 */
function clipRange(p, q, update, tEnter, tExit) {
  if (Math.abs(p) <= COLLISION_EPSILON) return q >= 0

  const r = q / p

  if (p < 0) {
    if (r > tExit + COLLISION_EPSILON) return false
    update(Math.max(tEnter, r), tExit)
    return true
  }

  if (r < tEnter - COLLISION_EPSILON) return false
  update(tEnter, Math.min(tExit, r))
  return true
}

/**
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @param {number} t
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
function quantizePointOnSegment(fromPos, toPos, t, bounds) {
  const clampedT = Math.max(0, Math.min(1, t))
  const rawX = fromPos.x + (toPos.x - fromPos.x) * clampedT
  const rawY = fromPos.y + (toPos.y - fromPos.y) * clampedT

  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, Math.round(rawX))),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, Math.round(rawY))),
  }
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
