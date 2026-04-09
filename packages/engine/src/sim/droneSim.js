import {
  ARENA_MAX,
  ARENA_MIN,
  REPAIR_DRONE_ENERGY_DRAIN_PER_TICK,
  REPAIR_DRONE_HEAL_AMOUNT,
  REPAIR_DRONE_HEAL_PULSE_TICKS,
  REPAIR_DRONE_HIT_POINTS,
  REPAIR_DRONE_MAX_ACTIVE,
  SLOT_IDS,
} from './constants.js'

const ORBIT_OFFSETS = [
  { x: 14, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 14 },
  { x: -10, y: 10 },
  { x: -14, y: 0 },
  { x: -10, y: -10 },
  { x: 0, y: -14 },
  { x: 10, y: -10 },
]

export function createRepairDrone(ownerBotId, slotIndex, orbitIndex) {
  return {
    droneId: '',
    ownerBotId,
    slotIndex,
    orbitIndex,
    hp: REPAIR_DRONE_HIT_POINTS,
    pos: { x: 0, y: 0 },
  }
}

export function countRepairDrones(drones, ownerBotId, slotIndex = null) {
  let count = 0
  for (const drone of drones) {
    if (drone.ownerBotId !== ownerBotId) continue
    if (slotIndex != null && drone.slotIndex !== slotIndex) continue
    count++
  }
  return count
}

export function nextRepairDroneOrbitIndex(drones, ownerBotId) {
  const used = new Set()
  for (const drone of drones) {
    if (drone.ownerBotId === ownerBotId) used.add(drone.orbitIndex)
  }

  for (let i = 0; i < REPAIR_DRONE_MAX_ACTIVE; i++) {
    if (!used.has(i)) return i
  }

  return -1
}

export function computeRepairDronePos(ownerPos, tick, orbitIndex) {
  const phase = ((tick + orbitIndex * 4) % ORBIT_OFFSETS.length + ORBIT_OFFSETS.length) % ORBIT_OFFSETS.length
  const off = ORBIT_OFFSETS[phase]

  return {
    x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, ownerPos.x + off.x)),
    y: Math.max(ARENA_MIN, Math.min(ARENA_MAX, ownerPos.y + off.y)),
  }
}

export function stepRepairDrones(tick, drones, bots, tickEvents) {
  /** @type {typeof drones} */
  const next = []

  for (const drone of drones) {
    const owner = botById(bots, drone.ownerBotId)
    if (!owner || !owner.alive) {
      tickEvents.push({
        type: 'DRONE_DESPAWN',
        droneId: drone.droneId,
        ownerBotId: drone.ownerBotId,
        reason: 'OWNER_DEAD',
        pos: { x: drone.pos.x, y: drone.pos.y },
      })
      continue
    }

    drone.pos = computeRepairDronePos(owner.pos, tick, drone.orbitIndex)

    if (owner.energy <= 0) {
      tickEvents.push({
        type: 'DRONE_DESPAWN',
        droneId: drone.droneId,
        ownerBotId: drone.ownerBotId,
        reason: 'NO_ENERGY',
        pos: { x: drone.pos.x, y: drone.pos.y },
      })
      continue
    }

    owner.energy = Math.max(0, owner.energy - REPAIR_DRONE_ENERGY_DRAIN_PER_TICK)
    tickEvents.push({
      type: 'RESOURCE_DELTA',
      botId: owner.botId,
      ammoDelta: 0,
      energyDelta: -REPAIR_DRONE_ENERGY_DRAIN_PER_TICK,
      healthDelta: 0,
      cause: 'DRONE_DRAIN',
    })

    if (owner.energy <= 0) {
      tickEvents.push({
        type: 'DRONE_DESPAWN',
        droneId: drone.droneId,
        ownerBotId: drone.ownerBotId,
        reason: 'NO_ENERGY',
        pos: { x: drone.pos.x, y: drone.pos.y },
      })
      continue
    }

    if (owner.hp < 100 && tick % REPAIR_DRONE_HEAL_PULSE_TICKS === drone.orbitIndex % REPAIR_DRONE_HEAL_PULSE_TICKS) {
      const amount = Math.min(REPAIR_DRONE_HEAL_AMOUNT, 100 - owner.hp)
      if (amount > 0) {
        owner.hp += amount
        tickEvents.push({
          type: 'RESOURCE_DELTA',
          botId: owner.botId,
          ammoDelta: 0,
          energyDelta: 0,
          healthDelta: amount,
          cause: 'DRONE_HEAL',
        })
        tickEvents.push({
          type: 'DRONE_HEAL',
          droneId: drone.droneId,
          ownerBotId: owner.botId,
          amount,
        })
      }
    }

    next.push(drone)
  }

  return next
}

export function despawnRepairDrones(drones, ownerBotId, slotIndex, reason, tickEvents) {
  /** @type {typeof drones} */
  const next = []
  let removed = 0

  for (const drone of drones) {
    if (drone.ownerBotId === ownerBotId && drone.slotIndex === slotIndex) {
      removed++
      tickEvents.push({
        type: 'DRONE_DESPAWN',
        droneId: drone.droneId,
        ownerBotId: drone.ownerBotId,
        reason,
        pos: { x: drone.pos.x, y: drone.pos.y },
      })
      continue
    }
    next.push(drone)
  }

  return { drones: next, removed }
}

function botById(bots, botId) {
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
