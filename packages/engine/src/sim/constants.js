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

// Kept high enough that ammo powerups matter during ordinary Workshop matches.
export const BULLET_AMMO_COST = 2
export const BULLET_COOLDOWN_TICKS = 4

export const GRENADE_SPEED_UNITS_PER_TICK = 24
export const GRENADE_FUSE_TICKS = 4
export const GRENADE_TTL_TICKS = 10
export const GRENADE_DAMAGE_CENTER = 18
export const GRENADE_DAMAGE_ADJACENT = 10
export const GRENADE_AMMO_COST = 6
export const GRENADE_COOLDOWN_TICKS = 8
export const SNIPER_DAMAGE = 25
// Raised from cost 4 / cooldown 10: at the old values a maxed AMMO bot could
// snipe every 6 ticks (~208 dmg/240-tick match), out-sustaining BULLET and
// ROCKET. Cost 6 + cooldown 12 caps a full-ammo burst at ~16 shots and makes
// ammo pickups matter for the sniper build.
export const SNIPER_AMMO_COST = 6
export const SNIPER_COOLDOWN_TICKS = 12
export const ROCKET_AMMO_COST = 8
export const ROCKET_COOLDOWN_TICKS = 12
export const ROCKET_SPEED_UNITS_PER_TICK = 3
export const ROCKET_FUSE_TICKS = 24
export const ROCKET_TTL_TICKS = 60
export const ROCKET_DAMAGE_CENTER = 35
export const ROCKET_DAMAGE_ADJACENT = 15
export const TELEPORT_ENERGY_COST = 25
export const TELEPORT_COOLDOWN_TICKS = 10
// Blink-adjacent damage: teleporting next to an enemy is a commit, not a free
// reposition. The blinker takes BLINK_CONTACT_DAMAGE on arrival (armor/shield
// mitigated) so pure blink-rush builds pay for the jump.
export const TELEPORT_BLINK_CONTACT_DAMAGE = 8
// Contact window: bots collide within BOT_HALF_SIZE*2; a few units of pad so
// blinking "next to" someone (not just on top of them) still costs HP.
export const TELEPORT_BLINK_CONTACT_RANGE_PAD = 6

// FLAMER (ruleset 0.3.0): close-range cone weapon, energy-per-tick while active.
// Balance pass: with damage 4/tick a 240-tick match allowed ~90 burn damage per
// flame window — far above every other module's output. Damage 2 + drain 3 caps
// a full-energy burst at ~66 dmg and makes the energy fund the real limiter.
export const FLAMER_RANGE = 26
export const FLAMER_CONE_COS = 0 // dot >= 0 => 180-degree facing cone (integer-friendly)
export const FLAMER_DAMAGE = 2
export const FLAMER_ENERGY_DRAIN_PER_TICK = 3

// RAILGUN (ruleset 0.3.0): piercing Bresenham beam along the shot direction.
// Balance pass (scripts/balance-weapons-duel.mjs): at cost 12 / 20 dmg the
// railgun did ~160 dmg per 100 AMMO single-target, about 40% of SNIPER (~400)
// and ROCKET (~420), and it only paid off with 2+ bots in line. Cost 8, cooldown
// 18, 24 first hit and 10 per pierced bot put single-target at ~290 per match
// (on par with GRENADE) while a 3-bot line still gives ~44 per shot.
export const RAILGUN_AMMO_COST = 8
export const RAILGUN_COOLDOWN_TICKS = 18
export const RAILGUN_DAMAGE_FIRST = 24
export const RAILGUN_DAMAGE_SUBSEQUENT = 10
export const RAILGUN_MAX_HITS = 3

// PULSE (ruleset 0.3.0): radial blast — damage + knockback + brief stun.
// Balance pass: previously pure utility (stun/knockback, zero damage), which
// made pulse bots deal no damage at all in the league. Added direct blast
// damage so it reads as an AoE finisher; the stun is what enables the follow-up.
export const PULSE_ENERGY_COST = 35
export const PULSE_COOLDOWN_TICKS = 25
export const PULSE_RADIUS = 40
export const PULSE_KNOCKBACK_UNITS = 12
export const PULSE_STUN_TICKS = 3
export const PULSE_DAMAGE = 10

// CLOAK (ruleset 0.3.0): self-invisibility to enemy targeting; attacking breaks it.
// Balance pass: 10 ticks was too short to reposition AND land a sniper shot
// before the enemy retargeted; 14 makes one cloak = one clean ambush.
export const CLOAK_ENERGY_COST = 30
export const CLOAK_COOLDOWN_TICKS = 24
export const CLOAK_DURATION_TICKS = 14

export const MINE_ARM_TICKS = 2
export const MINE_FUSE_TICKS = 18
export const MINE_TTL_TICKS = 18
export const MINE_DAMAGE_CENTER = 20
export const MINE_DAMAGE_ADJACENT = 12
export const MINE_AMMO_COST = 5
export const MINE_COOLDOWN_TICKS = 14

export const REPAIR_DRONE_MAX_ACTIVE = 2
export const REPAIR_DRONE_HIT_POINTS = 1
export const REPAIR_DRONE_HEAL_AMOUNT = 2
export const REPAIR_DRONE_HEAL_PULSE_TICKS = 4
export const REPAIR_DRONE_ENERGY_DRAIN_PER_TICK = 1
export const REPAIR_DRONE_AMMO_COST = 12
export const REPAIR_DRONE_COOLDOWN_TICKS = 6
export const REPAIR_DRONE_HALF_SIZE = 4

export const WALL_BUMP_DAMAGE = 2

// Damage dealt to both bots when they collide (bot-to-bot bump / ramming).
// Kept small so collisions discourage "stuck" behavior without dominating combat.
export const BOT_BUMP_DAMAGE = 1
