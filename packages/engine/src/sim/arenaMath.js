import { BOT_HALF_SIZE, SECTOR_SIZE_WORLD } from './constants.js'

export function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function locToWorld(loc) {
  const sectorId = clampInt(loc?.sector ?? 1, 1, 9)
  const zone = clampInt(loc?.zone ?? 0, 0, 4)

  const sectorRow = Math.floor((sectorId - 1) / 3)
  const sectorCol = (sectorId - 1) % 3
  const sectorOriginX = sectorCol * SECTOR_SIZE_WORLD
  const sectorOriginY = sectorRow * SECTOR_SIZE_WORLD

  if (zone === 0) return { x: sectorOriginX + 32, y: sectorOriginY + 32 }

  const zoneOffsets = {
    1: { x: 0, y: 0 },
    2: { x: 32, y: 0 },
    3: { x: 0, y: 32 },
    4: { x: 32, y: 32 },
  }

  const off = zoneOffsets[zone] ?? { x: 0, y: 0 }
  return {
    x: sectorOriginX + off.x + 16,
    y: sectorOriginY + off.y + 16,
  }
}

export function sectorFromPos(pos) {
  const col = clampInt(Math.floor(pos.x / SECTOR_SIZE_WORLD), 0, 2)
  const row = clampInt(Math.floor(pos.y / SECTOR_SIZE_WORLD), 0, 2)
  return row * 3 + col + 1
}

export function zoneFromPos(pos) {
  const sector = sectorFromPos(pos)
  const sectorRow = Math.floor((sector - 1) / 3)
  const sectorCol = (sector - 1) % 3
  const ox = sectorCol * SECTOR_SIZE_WORLD
  const oy = sectorRow * SECTOR_SIZE_WORLD

  const lx = pos.x - ox
  const ly = pos.y - oy

  const left = lx < 32
  const top = ly < 32

  if (top && left) return 1
  if (top && !left) return 2
  if (!top && left) return 3
  return 4
}

export function dirFromDelta(dx, dy) {
  const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1
  const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1

  if (sx === 0 && sy === 0) return 'UP'
  if (sx === 0 && sy < 0) return 'UP'
  if (sx === 0 && sy > 0) return 'DOWN'
  if (sy === 0 && sx < 0) return 'LEFT'
  if (sy === 0 && sx > 0) return 'RIGHT'
  if (sx < 0 && sy < 0) return 'UP_LEFT'
  if (sx > 0 && sy < 0) return 'UP_RIGHT'
  if (sx < 0 && sy > 0) return 'DOWN_LEFT'
  return 'DOWN_RIGHT'
}

export function oppositeDir(dir) {
  switch (dir) {
    case 'UP':
      return 'DOWN'
    case 'DOWN':
      return 'UP'
    case 'LEFT':
      return 'RIGHT'
    case 'RIGHT':
      return 'LEFT'
    case 'UP_LEFT':
      return 'DOWN_RIGHT'
    case 'UP_RIGHT':
      return 'DOWN_LEFT'
    case 'DOWN_LEFT':
      return 'UP_RIGHT'
    case 'DOWN_RIGHT':
      return 'UP_LEFT'
    default:
      return dir
  }
}

export function pointInBotAabb(botPos, p) {
  return Math.abs(botPos.x - p.x) <= BOT_HALF_SIZE && Math.abs(botPos.y - p.y) <= BOT_HALF_SIZE
}

export function botsOverlap(aPos, bPos) {
  return Math.abs(aPos.x - bPos.x) < BOT_HALF_SIZE * 2 && Math.abs(aPos.y - bPos.y) < BOT_HALF_SIZE * 2
}

export function clonePos(p) {
  return { x: p.x, y: p.y }
}

/**
 * Scale a vector toward a point to length <= maxLen using deterministic integer math.
 *
 * @param {number} dx
 * @param {number} dy
 * @param {number} maxLen
 */
export function scaleDeltaToMaxLen(dx, dy, maxLen) {
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 }

  const dist2 = dx * dx + dy * dy
  const max2 = maxLen * maxLen
  if (dist2 <= max2) return { dx, dy }

  const dist = Math.max(1, Math.floor(Math.sqrt(dist2)))

  const sx = dx < 0 ? -1 : 1
  const sy = dy < 0 ? -1 : 1
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)

  const ndx = Math.floor((ax * maxLen + Math.floor(dist / 2)) / dist)
  const ndy = Math.floor((ay * maxLen + Math.floor(dist / 2)) / dist)

  return { dx: sx * ndx, dy: sy * ndy }
}

/**
 * Deterministically normalize a vector to have Euclidean length <= `len`.
 *
 * Used for bullet velocity (Ruleset.md §5.1):
 *   vel = Normalize(targetPos - spawnPos) * bulletSpeedUnitsPerTick
 *
 * Notes:
 * - Uses floating point math (`Math.hypot` + `Math.round`) but returns integers.
 * - Final vector is clamped so `x^2 + y^2 <= len^2`.
 */
export function normalizeToLen(dx, dy, len) {
  if (dx === 0 && dy === 0) return { x: 0, y: -len }

  const dist = Math.hypot(dx, dy)
  if (!Number.isFinite(dist) || dist <= 0) return { x: 0, y: -len }

  const scale = len / dist

  let x = Math.round(dx * scale)
  let y = Math.round(dy * scale)

  // Avoid a zero vector due to rounding.
  if (x === 0 && y === 0) {
    if (Math.abs(dx) >= Math.abs(dy)) x = dx < 0 ? -1 : 1
    else y = dy < 0 ? -1 : 1
  }

  // Ensure we never exceed the desired speed due to rounding.
  const max2 = len * len
  while (x * x + y * y > max2) {
    if (Math.abs(x) >= Math.abs(y)) x += x < 0 ? 1 : -1
    else y += y < 0 ? 1 : -1

    // Defensive: don't loop forever.
    if (x === 0 && y === 0) {
      y = -1
      break
    }
  }

  return { x, y }
}

/**
 * Legacy bullet normalization (L∞) kept for reference. Prefer `normalizeToLen`.
 *
 * Integer normalization for bullets: returns a vector where
 * max(|vx|,|vy|) == maxAxis (unless dx=dy=0).
 */
export function normalizeToMaxAxis(dx, dy, maxAxis) {
  if (dx === 0 && dy === 0) return { x: 0, y: -maxAxis }

  const adx = Math.abs(dx)
  const ady = Math.abs(dy)

  if (adx >= ady) {
    const sx = dx < 0 ? -1 : 1
    const sy = dy < 0 ? -1 : 1
    const x = sx * maxAxis
    const y = sy * Math.floor((ady * maxAxis + Math.floor(adx / 2)) / Math.max(1, adx))
    return { x, y }
  }

  const sx = dx < 0 ? -1 : 1
  const sy = dy < 0 ? -1 : 1
  const y = sy * maxAxis
  const x = sx * Math.floor((adx * maxAxis + Math.floor(ady / 2)) / Math.max(1, ady))
  return { x, y }
}
