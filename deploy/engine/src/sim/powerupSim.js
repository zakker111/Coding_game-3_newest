import {
  BOT_HALF_SIZE,
  POWERUP_AMMO_AMOUNT,
  POWERUP_ANCHORS,
  POWERUP_ENERGY_AMOUNT,
  POWERUP_HEALTH_AMOUNT,
  POWERUP_LIFETIME_TICKS,
  POWERUP_MAX_ACTIVE,
  POWERUP_SPAWN_INTERVAL_MAX_TICKS,
  POWERUP_SPAWN_INTERVAL_MIN_TICKS,
  POWERUP_TYPES,
  SLOT_IDS,
} from './constants.js'
import { locToWorld, manhattan } from './arenaMath.js'
import { rngChoice, rngInt } from './prng.js'

export function initPowerupState(rng) {
  return {
    powerups: /** @type {Array<{powerupId:string,type:'HEALTH'|'AMMO'|'ENERGY',loc:{sector:number,zone:number},expiresAtTick:number}>} */ ([]),
    powerupCounter: 0,
    spawnRemainingTicks: rngInt(rng, POWERUP_SPAWN_INTERVAL_MIN_TICKS, POWERUP_SPAWN_INTERVAL_MAX_TICKS),
  }
}

export function stepPowerupPickups(powerupState, bots, tickEvents) {
  for (const botId of SLOT_IDS) {
    const bot = botsById(bots, botId)
    if (!bot || !bot.alive) continue

    let pickedIdx = -1

    for (let i = 0; i < powerupState.powerups.length; i++) {
      const p = powerupState.powerups[i]
      const pPos = locToWorld(p.loc)
      if (Math.abs(bot.pos.x - pPos.x) <= BOT_HALF_SIZE && Math.abs(bot.pos.y - pPos.y) <= BOT_HALF_SIZE) {
        pickedIdx = i
        break
      }
    }

    if (pickedIdx < 0) continue

    const p = powerupState.powerups[pickedIdx]
    powerupState.powerups.splice(pickedIdx, 1)

    tickEvents.push({
      type: 'POWERUP_PICKUP',
      botId: bot.botId,
      powerupId: p.powerupId,
      powerupType: p.type,
      loc: { sector: p.loc.sector, zone: p.loc.zone },
    })

    tickEvents.push({
      type: 'POWERUP_DESPAWN',
      powerupId: p.powerupId,
      reason: 'PICKUP',
    })

    let ammoDelta = 0
    let energyDelta = 0
    let healthDelta = 0

    if (p.type === 'HEALTH') {
      const gain = Math.max(0, Math.min(POWERUP_HEALTH_AMOUNT, 100 - bot.hp))
      bot.hp += gain
      healthDelta = gain
    } else if (p.type === 'AMMO') {
      const gain = Math.max(0, Math.min(POWERUP_AMMO_AMOUNT, 100 - bot.ammo))
      bot.ammo += gain
      ammoDelta = gain
    } else if (p.type === 'ENERGY') {
      const gain = Math.max(0, Math.min(POWERUP_ENERGY_AMOUNT, 100 - bot.energy))
      bot.energy += gain
      energyDelta = gain
    }

    if (ammoDelta || energyDelta || healthDelta) {
      tickEvents.push({
        type: 'RESOURCE_DELTA',
        botId: bot.botId,
        ammoDelta,
        energyDelta,
        healthDelta,
        cause: `PICKUP_${p.type}`,
      })
    }
  }
}

export function stepPowerupMaintenance(powerupState, bots, tick, rng, tickEvents) {
  // TTL despawn (end-of-tick maintenance)
  for (let i = powerupState.powerups.length - 1; i >= 0; i--) {
    const p = powerupState.powerups[i]
    if (p.expiresAtTick > tick) continue

    powerupState.powerups.splice(i, 1)

    tickEvents.push({
      type: 'POWERUP_DESPAWN',
      powerupId: p.powerupId,
      reason: 'RULES',
    })
  }

  // Spawn timer + spawn (end-of-tick maintenance)
  powerupState.spawnRemainingTicks--
  if (powerupState.spawnRemainingTicks > 0) return

  if (powerupState.powerups.length >= POWERUP_MAX_ACTIVE) {
    powerupState.spawnRemainingTicks = 1
    return
  }

  const occupiedKeys = new Set(powerupState.powerups.map((p) => `${p.loc.sector}:${p.loc.zone}`))

  const candidates = POWERUP_ANCHORS.filter((loc) => {
    const k = `${loc.sector}:${loc.zone}`
    if (occupiedKeys.has(k)) return false

    // Avoid spawning directly inside a bot AABB.
    const pos = locToWorld(loc)
    return !bots.some(
      (b) => b.alive && Math.abs(b.pos.x - pos.x) <= BOT_HALF_SIZE && Math.abs(b.pos.y - pos.y) <= BOT_HALF_SIZE
    )
  })

  if (!candidates.length) {
    powerupState.spawnRemainingTicks = 1
    return
  }

  const loc = candidates[rngInt(rng, 0, candidates.length - 1)]
  const kind = rngChoice(rng, POWERUP_TYPES)
  const powerupId = `P${++powerupState.powerupCounter}`

  powerupState.powerups.push({
    powerupId,
    type: kind,
    loc: { sector: loc.sector, zone: loc.zone },
    expiresAtTick: tick + POWERUP_LIFETIME_TICKS,
  })

  tickEvents.push({
    type: 'POWERUP_SPAWN',
    powerupId,
    powerupType: kind,
    loc: { sector: loc.sector, zone: loc.zone },
  })

  powerupState.spawnRemainingTicks = rngInt(rng, POWERUP_SPAWN_INTERVAL_MIN_TICKS, POWERUP_SPAWN_INTERVAL_MAX_TICKS)
}

export function powerupExists(powerupState, type) {
  return powerupState.powerups.some((p) => p.type === type)
}

export function findClosestPowerupLoc(powerupState, fromPos, preferredType) {
  /** @type {{ loc: {sector:number,zone:number}, d: number } | null} */
  let best = null

  for (const p of powerupState.powerups) {
    if (preferredType && p.type !== preferredType) continue
    const pos = locToWorld(p.loc)
    const d = manhattan(fromPos, pos)

    if (!best || d < best.d) {
      best = { loc: p.loc, d }
    } else if (d === best.d) {
      // Tie-break: lowest sector; sector center beats zones; lowest zone.
      if (p.loc.sector < best.loc.sector) best = { loc: p.loc, d }
      else if (p.loc.sector === best.loc.sector) {
        if ((p.loc.zone === 0) !== (best.loc.zone === 0)) {
          if (p.loc.zone === 0) best = { loc: p.loc, d }
        } else if (p.loc.zone < best.loc.zone) {
          best = { loc: p.loc, d }
        }
      }
    }
  }

  return best?.loc ?? null
}

/**
 * @param {any[]} bots
 * @param {'BOT1'|'BOT2'|'BOT3'|'BOT4'} botId
 */
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
