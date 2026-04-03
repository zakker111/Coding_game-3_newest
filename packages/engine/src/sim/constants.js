export const SLOT_IDS = /** @type {const} */ (['BOT1', 'BOT2', 'BOT3', 'BOT4'])

export const ARENA_MIN = 0
export const ARENA_MAX = 192

export const BOT_HALF_SIZE = 8
export const BOT_CENTER_MIN = BOT_HALF_SIZE
export const BOT_CENTER_MAX = ARENA_MAX - BOT_HALF_SIZE

export const SECTOR_SIZE_WORLD = 64

export const POWERUP_SPAWN_INTERVAL_MIN_TICKS = 10
export const POWERUP_SPAWN_INTERVAL_MAX_TICKS = 20
export const POWERUP_MAX_ACTIVE = 6
export const POWERUP_LIFETIME_TICKS = 30

export const POWERUP_HEALTH_AMOUNT = 30
export const POWERUP_AMMO_AMOUNT = 20
export const POWERUP_ENERGY_AMOUNT = 30

export const POWERUP_TYPES = /** @type {const} */ (['HEALTH', 'AMMO', 'ENERGY'])

// Stable anchor order (sector asc; sector center first; then zones 1..4).
export const POWERUP_ANCHORS = (() => {
  /** @type {Array<{ sector: number, zone: number }>} */
  const out = []
  for (let sector = 1; sector <= 9; sector++) {
    out.push({ sector, zone: 0 })
    for (let zone = 1; zone <= 4; zone++) out.push({ sector, zone })
  }
  return out
})()

export const BULLET_SPEED_UNITS_PER_TICK = 16
export const BULLET_TTL_TICKS = 18
export const BULLET_DAMAGE = 10

export const BULLET_AMMO_COST = 1
export const BULLET_COOLDOWN_TICKS = 4

export const WALL_BUMP_DAMAGE = 2

// Damage dealt to both bots when they collide (bot-to-bot bump / ramming).
// Kept small so collisions discourage "stuck" behavior without dominating combat.
export const BOT_BUMP_DAMAGE = 1
