import { loadoutHasModule, normalizeLoadout } from '@coding-game/ruleset'

import { createRng, rngChoice, rngInt } from './prng.js'

const BOT_CENTER_MIN = 8
const BOT_CENTER_MAX = 184
const ARENA_MIN = 0
const ARENA_MAX = 192

const BOT_HALF_SIZE = 8

const SECTOR_SIZE_WORLD = 64

const POWERUP_SPAWN_INTERVAL_MIN_TICKS = 10
const POWERUP_SPAWN_INTERVAL_MAX_TICKS = 20
const POWERUP_MAX_ACTIVE = 6
const POWERUP_LIFETIME_TICKS = 30

const POWERUP_HEALTH_AMOUNT = 30
const POWERUP_AMMO_AMOUNT = 20
const POWERUP_ENERGY_AMOUNT = 30

const POWERUP_TYPES = /** @type {const} */ (['HEALTH', 'AMMO', 'ENERGY'])

const POWERUP_ANCHORS = (() => {
  const out = []
  for (let sector = 1; sector <= 9; sector++) {
    out.push({ sector, zone: 0 })
    for (let zone = 1; zone <= 4; zone++) out.push({ sector, zone })
  }
  return out
})()

const MOVE_SPEED = 2
const BULLET_SPEED = 10
const BULLET_TTL = 18
const BULLET_DAMAGE = 10
const SHOOT_COOLDOWN_TICKS = 7

// Keep ammo visibly consumable within a typical sample replay tickCap.
const BOT2_INITIAL_AMMO = 28

const SAW_ON_RANGE = BOT_HALF_SIZE * 2 + 6
const SAW_OFF_RANGE = SAW_ON_RANGE + 4
const SAW_ATTACK_RANGE = BOT_HALF_SIZE * 2 + 2
const SAW_DAMAGE = 6
const SAW_ENERGY_DRAIN = 1

const SHIELD_THREAT_RANGE = 44
const SHIELD_ENERGY_DRAIN = 1
const SHIELD_ABSORB_FRACTION = 0.5

const DIRS = /** @type {const} */ ([
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'UP_LEFT',
  'UP_RIGHT',
  'DOWN_LEFT',
  'DOWN_RIGHT',
])

const SLOT_IDS = /** @type {const} */ (['BOT1', 'BOT2', 'BOT3', 'BOT4'])

/** @param {import('./index.d.ts').MoveDir} dir */
function oppositeDir(dir) {
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

function bumpPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function stripBotSourceForHeuristics(sourceText) {
  if (!sourceText) return ''

  // This file is NOT a full DSL runner. We only use sourceText for lightweight heuristics,
  // and we want edits like “clear the bot” to have an obvious effect.
  return sourceText
    .split(/\r?\n/g)
    .map((line) => line.replace(/\t/g, ' ').trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//') && !line.startsWith(';'))
    .join('\n')
    .trim()
}

function botSourceLooksIdle(sourceText) {
  const s = stripBotSourceForHeuristics(sourceText)
  if (!s) return true

  // Heuristic: if the script is just LABEL/GOTO/WAIT, treat as a do-nothing bot.
  for (const line of s.split('\n')) {
    if (/^(LABEL|GOTO)\b/i.test(line)) continue
    if (/^WAIT\b/i.test(line)) continue
    return false
  }

  return true
}

/** @returns {import('./index.d.ts').MoveDir} */
function dirToward(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y

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

function round3(n) {
  return Math.round(n * 1000) / 1000
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

function locToWorld(loc) {
  const sectorId = clampInt(loc?.sector ?? 1, 1, 9)
  const zone = clampInt(loc?.zone ?? 0, 0, 4)

  const sectorRow = Math.floor((sectorId - 1) / 3)
  const sectorCol = (sectorId - 1) % 3
  const sectorOriginX = sectorCol * SECTOR_SIZE_WORLD
  const sectorOriginY = sectorRow * SECTOR_SIZE_WORLD

  if (zone === 0) {
    return { x: sectorOriginX + 32, y: sectorOriginY + 32 }
  }

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

/** @returns {import('./index.d.ts').ReplayTickState['powerups'][number]['type'] | null} */
function parseTargetPowerupType(sourceText) {
  const s = stripBotSourceForHeuristics(sourceText)
  if (!s) return null
  const m = s.match(/\b(?:TARGET_POWERUP|SET_MOVE_TO_POWERUP)\s+(HEALTH|AMMO|ENERGY)\b/i)
  if (!m) return null
  const v = m[1]?.toUpperCase()
  if (v === 'HEALTH' || v === 'AMMO' || v === 'ENERGY') return v
  return null
}

function botSourceWantsPowerups(sourceText) {
  const s = stripBotSourceForHeuristics(sourceText)
  if (!s) return false
  return (
    /\bTARGET_POWERUP\b/i.test(s) || /\bMOVE_TO_TARGET\b/i.test(s) || /\bSET_MOVE_TO_POWERUP\b/i.test(s)
  )
}

/** @param {import('./index.d.ts').MoveDir} dir */
function vecForDir(dir) {
  switch (dir) {
    case 'UP':
      return { x: 0, y: -1 }
    case 'DOWN':
      return { x: 0, y: 1 }
    case 'LEFT':
      return { x: -1, y: 0 }
    case 'RIGHT':
      return { x: 1, y: 0 }
    case 'UP_LEFT':
      return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
    case 'UP_RIGHT':
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 }
    case 'DOWN_LEFT':
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
    case 'DOWN_RIGHT':
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    default:
      return { x: 0, y: 0 }
  }
}

function dist2(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function findOverlappingLivingBot(bots, botId, pos) {
  /** @type {any | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive || b.botId === botId) continue

    if (
      Math.abs(b.pos.x - pos.x) < BOT_HALF_SIZE * 2 &&
      Math.abs(b.pos.y - pos.y) < BOT_HALF_SIZE * 2
    ) {
      if (!best) {
        best = b
      } else {
        const bestIdx = SLOT_IDS.indexOf(best.botId)
        const idx = SLOT_IDS.indexOf(b.botId)
        if (idx < bestIdx) best = b
      }
    }
  }

  return best
}

function findNearestLivingBot(bots, fromBotId, fromPos) {
  /** @type {{ bot: any; d2: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive || b.botId === fromBotId) continue
    const d2 = dist2(fromPos, b.pos)
    if (!best || d2 < best.d2) best = { bot: b, d2 }
  }

  return best?.bot ?? null
}

function segmentIntersectsAabb(p0, p1, min, max) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  let tMin = 0
  let tMax = 1

  if (dx === 0) {
    if (p0.x < min.x || p0.x > max.x) return null
  } else {
    const tx1 = (min.x - p0.x) / dx
    const tx2 = (max.x - p0.x) / dx
    const t1 = Math.min(tx1, tx2)
    const t2 = Math.max(tx1, tx2)
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }

  if (dy === 0) {
    if (p0.y < min.y || p0.y > max.y) return null
  } else {
    const ty1 = (min.y - p0.y) / dy
    const ty2 = (max.y - p0.y) / dy
    const t1 = Math.min(ty1, ty2)
    const t2 = Math.max(ty1, ty2)
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }

  if (tMax < 0 || tMin > 1) return null

  const tHit = clamp(tMin, 0, 1)
  return {
    t: tHit,
    pos: {
      x: round3(p0.x + dx * tHit),
      y: round3(p0.y + dy * tHit),
    },
  }
}

function segmentHitsArenaWall(p0, p1) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  /** @type {number[]} */
  const ts = []

  if (dx !== 0) {
    ts.push((ARENA_MIN - p0.x) / dx)
    ts.push((ARENA_MAX - p0.x) / dx)
  }
  if (dy !== 0) {
    ts.push((ARENA_MIN - p0.y) / dy)
    ts.push((ARENA_MAX - p0.y) / dy)
  }

  let bestT = Number.POSITIVE_INFINITY

  for (const t of ts) {
    if (t <= 0 || t > 1) continue
    const x = p0.x + dx * t
    const y = p0.y + dy * t
    if (x < ARENA_MIN - 1e-9 || x > ARENA_MAX + 1e-9) continue
    if (y < ARENA_MIN - 1e-9 || y > ARENA_MAX + 1e-9) continue

    if (t < bestT) bestT = t
  }

  if (!Number.isFinite(bestT)) return null

  const pos = {
    x: round3(clamp(p0.x + dx * bestT, ARENA_MIN, ARENA_MAX)),
    y: round3(clamp(p0.y + dy * bestT, ARENA_MIN, ARENA_MAX)),
  }

  return { t: bestT, pos }
}

function clonePos(p) {
  return { x: p.x, y: p.y }
}

function stepPc(pc) {
  const next = pc + 1
  return next > 24 ? 1 : next
}

function defaultAppearanceForSlot(slotId) {
  switch (slotId) {
    case 'BOT1':
      return { kind: 'COLOR', color: '#4ade80' }
    case 'BOT2':
      return { kind: 'COLOR', color: '#60a5fa' }
    case 'BOT3':
      return { kind: 'COLOR', color: '#f472b6' }
    case 'BOT4':
      return { kind: 'COLOR', color: '#fbbf24' }
    default:
      return { kind: 'COLOR', color: '#e2e8f0' }
  }
}

/**
 * @param {unknown} input
 * @param {any[]} fallback
 */
function normalizeHeaderBots(input, fallback) {
  if (!Array.isArray(input)) return fallback

  const byId = new Map(input.map((b) => [b?.slotId, b]))
  if (!SLOT_IDS.every((id) => byId.has(id))) return fallback

  return SLOT_IDS.map((slotId) => {
    const b = byId.get(slotId)

    const appearance =
      b?.appearance?.kind === 'COLOR' && typeof b.appearance.color === 'string' ? b.appearance : null

    const sourceText = typeof b?.sourceText === 'string' ? b.sourceText : ''

    /** @type {[any, any, any]} */
    let loadout = [null, null, null]
    let loadoutIssues

    if (Array.isArray(b?.loadout) && b.loadout.length === 3) {
      const normalized = normalizeLoadout(b.loadout)
      loadout = normalized.loadout
      loadoutIssues = normalized.issues.length ? normalized.issues : undefined
    }

    return {
      slotId,
      displayName: typeof b?.displayName === 'string' ? b.displayName : slotId,
      appearance: appearance ?? defaultAppearanceForSlot(slotId),
      sourceText,
      loadout,
      loadoutIssues,
    }
  })
}

/**
 * @typedef {import('./index.d.ts').Replay} Replay
 */

/**
 * Deterministic sample replay generator for driving client visuals.
 *
 * Tick semantics match `ReplayViewerPlan.md`:
 * - state[t] is end-of-tick for tick t
 * - events[t] are events that transformed state[t-1] -> state[t]
 */
export function generateSampleReplay(seed, opts = {}) {
  const tickCap = opts.tickCap ?? 200
  const rng = createRng(seed)

  const defaultHeaderBots = /** @type {Replay['bots']} */ ([
    {
      slotId: 'BOT1',
      displayName: 'Aggressive Skirmisher',
      appearance: { kind: 'COLOR', color: '#4ade80' },
      loadout: ['BULLET', null, null],
      sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot0 — Aggressive Skirmisher (starter)
; Loadout: SLOT1=BULLET
; Summary: chase+shoot the closest bot; avoid bump-lock; detour for HEALTH/AMMO when low; dodge enemy bullets when threatened.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
; (Use a slightly larger threshold than the bot hitbox to avoid repeated bumps.)
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick to reduce face-tanking.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal when hurt (clear bot target so MOVE_TO_TARGET prefers the powerup).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Resupply when low (and we aren't currently healing).
; (Ammo drains slowly with the current cooldown, so use a higher threshold for demos.)
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Otherwise pick a fight.
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET
GOTO LOOP

LABEL BACKOFF
; Break pursuit and step to the opposite zone in our current sector.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP

LABEL RESUPPLY
CLEAR_TARGET_BOT
TARGET_POWERUP AMMO
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP
`,
    },
    {
      slotId: 'BOT2',
      displayName: 'Chaser Shooter',
      appearance: { kind: 'COLOR', color: '#60a5fa' },
      loadout: ['BULLET', null, null],
      sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot2 — Chaser Shooter
; Loadout: SLOT1=BULLET
; Summary: choose a target (BOT1→BOT3→BOT4), chase it, shoot it; avoid bump-lock; detour for HEALTH/AMMO; dodge enemy bullets.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal / resupply detours.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Target the first alive enemy in priority order.
; (This script is intended to run in the BOT2 slot, so we intentionally skip BOT2.)
IF (BOT_ALIVE(BOT1)) DO SET_TARGET BOT1
IF (!BOT_ALIVE(BOT1) && BOT_ALIVE(BOT3)) DO SET_TARGET BOT3
IF (!BOT_ALIVE(BOT1) && !BOT_ALIVE(BOT3) && BOT_ALIVE(BOT4)) DO SET_TARGET BOT4

SET_MOVE_TO_TARGET

IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL BACKOFF
; Break pursuit and step to the opposite zone in our current sector.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP

LABEL RESUPPLY
CLEAR_TARGET_BOT
TARGET_POWERUP AMMO
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP
`,
    },
    {
      slotId: 'BOT3',
      displayName: 'Corner Bunker',
      appearance: { kind: 'COLOR', color: '#f472b6' },
      loadout: ['BULLET', null, null],
      sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot3 — Corner Bunker
; Loadout: SLOT1=BULLET
; Summary: hold a home corner; avoid bump-lock; dodge bullets; run to powerups when low (with a short WAIT); shoot the closest bot when close.

SET_MOVE_TO_SECTOR 1 ZONE 1

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Pick a powerup goal (priority: health → ammo).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO

; If we decided to go get a powerup, commit for 2 ticks while the goal keeps moving us.
; Note: WAIT is control-flow and cannot be nested under IF (...) DO ....
IF ((HEALTH < 70 && POWERUP_EXISTS(HEALTH)) || (AMMO < 80 && POWERUP_EXISTS(AMMO))) GOTO COMMIT_POWERUP

; Otherwise, go back home.
IF (HEALTH >= 70 && AMMO >= 80) DO SET_MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 120) DO USE_SLOT1 CLOSEST_BOT

GOTO LOOP

LABEL COMMIT_POWERUP
WAIT 2
GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume normal logic.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
CLEAR_MOVE
GOTO LOOP
`,
    },
    {
      slotId: 'BOT4',
      displayName: 'Saw Rusher',
      appearance: { kind: 'COLOR', color: '#fbbf24' },
      loadout: ['SAW', 'SHIELD', null],
      sourceText: `;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot4 — Saw Rusher
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; bump/close→saw burst; bullets nearby→shield burst; sidestep when too close.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; SAW burst window after a bump.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; If we get right on top of someone, turn the saw on even without a bump.
IF (DIST_TO_CLOSEST_BOT() <= 18 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (DIST_TO_CLOSEST_BOT() > 40 && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; If we're very close, briefly sidestep to avoid repeated bumps.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Shield when bullets are around (keep it on for at least 3 ticks).
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO SHIELD OFF

GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume chase.
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
    },
  ])

  const headerBots = normalizeHeaderBots(opts.bots, defaultHeaderBots)

  const headerById = /** @type {Record<import('./index.d.ts').SlotId, any>} */ ({
    BOT1: headerBots.find((b) => b.slotId === 'BOT1'),
    BOT2: headerBots.find((b) => b.slotId === 'BOT2'),
    BOT3: headerBots.find((b) => b.slotId === 'BOT3'),
    BOT4: headerBots.find((b) => b.slotId === 'BOT4'),
  })

  const sawCapableByBotId = /** @type {Record<import('./index.d.ts').SlotId, boolean>} */ ({
    BOT1: loadoutHasModule(headerById.BOT1?.loadout, 'SAW'),
    BOT2: loadoutHasModule(headerById.BOT2?.loadout, 'SAW'),
    BOT3: loadoutHasModule(headerById.BOT3?.loadout, 'SAW'),
    BOT4: loadoutHasModule(headerById.BOT4?.loadout, 'SAW'),
  })

  const shieldCapableByBotId = /** @type {Record<import('./index.d.ts').SlotId, boolean>} */ ({
    BOT1: loadoutHasModule(headerById.BOT1?.loadout, 'SHIELD'),
    BOT2: loadoutHasModule(headerById.BOT2?.loadout, 'SHIELD'),
    BOT3: loadoutHasModule(headerById.BOT3?.loadout, 'SHIELD'),
    BOT4: loadoutHasModule(headerById.BOT4?.loadout, 'SHIELD'),
  })

  const bulletCapableByBotId = /** @type {Record<import('./index.d.ts').SlotId, boolean>} */ ({
    BOT1: loadoutHasModule(headerById.BOT1?.loadout, 'BULLET'),
    BOT2: loadoutHasModule(headerById.BOT2?.loadout, 'BULLET'),
    BOT3: loadoutHasModule(headerById.BOT3?.loadout, 'BULLET'),
    BOT4: loadoutHasModule(headerById.BOT4?.loadout, 'BULLET'),
  })

  const botIdleByBotId = /** @type {Record<import('./index.d.ts').SlotId, boolean>} */ ({
    BOT1: botSourceLooksIdle(headerById.BOT1?.sourceText),
    BOT2: botSourceLooksIdle(headerById.BOT2?.sourceText),
    BOT3: botSourceLooksIdle(headerById.BOT3?.sourceText),
    BOT4: botSourceLooksIdle(headerById.BOT4?.sourceText),
  })

  const botWantsPowerupsByBotId = /** @type {Record<import('./index.d.ts').SlotId, boolean>} */ ({
    BOT1: botSourceWantsPowerups(headerById.BOT1?.sourceText),
    BOT2: botSourceWantsPowerups(headerById.BOT2?.sourceText),
    BOT3: botSourceWantsPowerups(headerById.BOT3?.sourceText),
    BOT4: botSourceWantsPowerups(headerById.BOT4?.sourceText),
  })

  const botPreferredPowerupByBotId = /** @type {Record<import('./index.d.ts').SlotId, import('./index.d.ts').ReplayTickState['powerups'][number]['type'] | null>} */ ({
    BOT1: parseTargetPowerupType(headerById.BOT1?.sourceText),
    BOT2: parseTargetPowerupType(headerById.BOT2?.sourceText),
    BOT3: parseTargetPowerupType(headerById.BOT3?.sourceText),
    BOT4: parseTargetPowerupType(headerById.BOT4?.sourceText),
  })

  const spawnPosById = {
    BOT1: { x: 16, y: 16 },
    BOT2: { x: 176, y: 16 },
    BOT3: { x: 16, y: 176 },
    BOT4: { x: 176, y: 176 },
  }

  /** @type {Array<{botId: import('./index.d.ts').SlotId, pos: {x:number,y:number}, hp:number, ammo:number, energy:number, alive:boolean, pc:number, moveDir: import('./index.d.ts').MoveDir, shootCd:number, sawCapable:boolean, sawActive:boolean, shieldCapable:boolean, shieldActive:boolean}>} */
  const bots = SLOT_IDS.map((botId) => ({
    botId,
    pos: clonePos(spawnPosById[botId]),
    hp: 100,
    ammo: botId === 'BOT2' ? BOT2_INITIAL_AMMO : 40,
    energy: 100,
    alive: true,
    pc: rngInt(rng, 1, 8),
    moveDir: botId === 'BOT1' || botId === 'BOT3' ? 'RIGHT' : 'LEFT',
    shootCd: 0,
    sawCapable: sawCapableByBotId[botId],
    sawActive: false,
    shieldCapable: shieldCapableByBotId[botId],
    shieldActive: false,
  }))

  /** @type {Array<{bulletId:string, ownerBotId: import('./index.d.ts').SlotId, pos:{x:number,y:number}, vel:{x:number,y:number}, ttl:number}>} */
  let bullets = []
  let bulletCounter = 0

  /** @type {Array<{powerupId:string,type:'HEALTH'|'AMMO'|'ENERGY',loc:{sector:number,zone:number}}>} */
  const powerups = []
  let powerupCounter = 0
  let powerupSpawnRemaining = rngInt(
    rng,
    POWERUP_SPAWN_INTERVAL_MIN_TICKS,
    POWERUP_SPAWN_INTERVAL_MAX_TICKS
  )

  const state = /** @type {Replay['state']} */ ([])
  const events = /** @type {Replay['events']} */ ([])

  state.push({
    t: 0,
    bots: bots.map((b) => ({
      botId: b.botId,
      pos: clonePos(b.pos),
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
      pc: b.pc,
    })),
    bullets: [],
    powerups: [],
  })
  events.push([])

  const sawOnRange2 = SAW_ON_RANGE * SAW_ON_RANGE
  const sawOffRange2 = SAW_OFF_RANGE * SAW_OFF_RANGE
  const sawAttackRange2 = SAW_ATTACK_RANGE * SAW_ATTACK_RANGE

  for (let t = 1; t <= tickCap; t++) {
    /** @type {Replay['events'][number]} */
    const tickEvents = []
    const bumpedBotPairs = new Set()

    // bots act
    for (const bot of bots) {
      if (!bot.alive) continue

      if (bot.shootCd > 0) bot.shootCd--

      const pcBefore = bot.pc
      let pcAfter = stepPc(pcBefore)

      // If the user clears their bot script, we want that to be visually obvious.
      // Treat empty/comment-only or LABEL/GOTO/WAIT-only scripts as idle (no movement/shooting).
      if (botIdleByBotId[bot.botId]) {
        tickEvents.push({
          type: 'BOT_EXEC',
          botId: bot.botId,
          pcBefore,
          pcAfter,
          instrText: 'NOP',
          result: 'NOP',
          reason: 'INVALID_INSTR',
        })

        bot.pc = pcAfter
        continue
      }

      const nearest = findNearestLivingBot(bots, bot.botId, bot.pos)
      const nearestD2 = nearest ? dist2(bot.pos, nearest.pos) : Number.POSITIVE_INFINITY

      if (bot.sawCapable) {
        let nextSawActive = bot.sawActive

        if (!nearest || bot.energy <= 0) {
          nextSawActive = false
        } else if (!bot.sawActive && nearestD2 <= sawOnRange2) {
          nextSawActive = true
        } else if (bot.sawActive && nearestD2 >= sawOffRange2) {
          nextSawActive = false
        }

        if (nextSawActive !== bot.sawActive) {
          bot.sawActive = nextSawActive
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter: pcBefore,
            instrText: bot.sawActive ? 'SAW ON' : 'SAW OFF',
            result: 'EXECUTED',
          })
        }

        if (bot.sawActive && bot.energy > 0) {
          const drain = Math.min(SAW_ENERGY_DRAIN, bot.energy)
          bot.energy -= drain

          tickEvents.push({
            type: 'RESOURCE_DELTA',
            botId: bot.botId,
            ammoDelta: 0,
            energyDelta: -drain,
            healthDelta: 0,
            cause: 'SAW_DRAIN',
          })

          if (bot.energy <= 0) {
            bot.sawActive = false
            tickEvents.push({
              type: 'BOT_EXEC',
              botId: bot.botId,
              pcBefore,
              pcAfter: pcBefore,
              instrText: 'SAW OFF',
              result: 'EXECUTED',
            })
          }
        }
      }

      const attemptShoot = bot.botId === 'BOT2' && bulletCapableByBotId[bot.botId]
      let shotExecuted = false

      if (attemptShoot) {
        const target = nearest

        if (bot.shootCd > 0) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'COOLDOWN',
          })
        } else if (bot.ammo <= 0) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'NO_AMMO',
          })
        } else if (!target) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'INVALID_TARGET',
          })
        } else {
          const to = target.pos
          const dx = to.x - bot.pos.x
          const dy = to.y - bot.pos.y
          const len = Math.max(1e-9, Math.hypot(dx, dy))
          const vx = round3((dx / len) * BULLET_SPEED)
          const vy = round3((dy / len) * BULLET_SPEED)

          const bulletId = `B${++bulletCounter}`
          const bullet = {
            bulletId,
            ownerBotId: bot.botId,
            pos: clonePos(bot.pos),
            vel: { x: vx, y: vy },
            ttl: BULLET_TTL,
          }

          bullets.push(bullet)

          bot.ammo--
          bot.shootCd = SHOOT_COOLDOWN_TICKS
          shotExecuted = true

          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'EXECUTED',
          })

          tickEvents.push({
            type: 'RESOURCE_DELTA',
            botId: bot.botId,
            ammoDelta: -1,
            energyDelta: 0,
            healthDelta: 0,
            cause: 'SHOOT',
          })

          tickEvents.push({
            type: 'BULLET_SPAWN',
            bulletId,
            ownerBotId: bot.botId,
            pos: clonePos(bullet.pos),
            vel: { x: vx, y: vy },
            targetBotId: target.botId,
            targetPos: clonePos(target.pos),
          })
        }
      }

      if (!shotExecuted) {
        if (bot.botId === 'BOT2') {
          const target = bots.find((b) => b.alive && b.botId === 'BOT1')
          if (target) bot.moveDir = dirToward(bot.pos, target.pos)
        } else if (botWantsPowerupsByBotId[bot.botId] && powerups.length) {
          const preferred = botPreferredPowerupByBotId[bot.botId]

          /** @type {{ loc: {sector:number,zone:number}, d2: number } | null} */
          let best = null

          for (const p of powerups) {
            if (preferred && p.type !== preferred) continue
            const pos = locToWorld(p.loc)
            const d2 = dist2(bot.pos, pos)
            if (!best || d2 < best.d2) best = { loc: p.loc, d2 }
          }

          if (!best) {
            for (const p of powerups) {
              const pos = locToWorld(p.loc)
              const d2 = dist2(bot.pos, pos)
              if (!best || d2 < best.d2) best = { loc: p.loc, d2 }
            }
          }

          if (best) {
            bot.moveDir = dirToward(bot.pos, locToWorld(best.loc))
          }
        } else if (bot.sawCapable && nearest) {
          bot.moveDir = dirToward(bot.pos, nearest.pos)
        }

        const moveDir = bot.moveDir
        const dirVec = vecForDir(moveDir)
        const fromPos = clonePos(bot.pos)

        let toPos = {
          x: round3(fromPos.x + dirVec.x * MOVE_SPEED),
          y: round3(fromPos.y + dirVec.y * MOVE_SPEED),
        }

        const clamped = {
          x: round3(clamp(toPos.x, BOT_CENTER_MIN, BOT_CENTER_MAX)),
          y: round3(clamp(toPos.y, BOT_CENTER_MIN, BOT_CENTER_MAX)),
        }

        const bumpedWall = clamped.x !== toPos.x || clamped.y !== toPos.y
        toPos = clamped

        const overlapped = findOverlappingLivingBot(bots, bot.botId, toPos)

        tickEvents.push({
          type: 'BOT_EXEC',
          botId: bot.botId,
          pcBefore,
          pcAfter,
          instrText: `MOVE_${moveDir}`,
          result: 'EXECUTED',
        })

        if (overlapped) {
          const key = bumpPairKey(bot.botId, overlapped.botId)

          if (!bumpedBotPairs.has(key)) {
            bumpedBotPairs.add(key)

            tickEvents.push({
              type: 'BUMP_BOT',
              botId: bot.botId,
              otherBotId: overlapped.botId,
              dir: moveDir,
            })

            tickEvents.push({
              type: 'BUMP_BOT',
              botId: overlapped.botId,
              otherBotId: bot.botId,
              dir: oppositeDir(moveDir),
            })
          }

          bot.moveDir = oppositeDir(moveDir)
        } else {
          bot.pos = toPos

          if (fromPos.x !== toPos.x || fromPos.y !== toPos.y) {
            tickEvents.push({
              type: 'BOT_MOVED',
              botId: bot.botId,
              fromPos,
              toPos,
              dir: moveDir,
            })
          }

          if (bumpedWall) {
            tickEvents.push({
              type: 'BUMP_WALL',
              botId: bot.botId,
              dir: moveDir,
              damage: 0,
            })

            bot.moveDir = oppositeDir(moveDir)
          }
        }
      }

      if (bot.sawActive && bot.energy > 0) {
        const victim = findNearestLivingBot(bots, bot.botId, bot.pos)
        if (victim && dist2(bot.pos, victim.pos) <= sawAttackRange2) {
          victim.hp = Math.max(0, victim.hp - SAW_DAMAGE)

          tickEvents.push({
            type: 'DAMAGE',
            victimBotId: victim.botId,
            amount: SAW_DAMAGE,
            source: 'SAW',
            sourceBotId: bot.botId,
            kind: 'DIRECT',
            sourceRef: { type: 'SAW', id: bot.botId },
          })

          if (victim.hp <= 0 && victim.alive) {
            victim.alive = false
            tickEvents.push({
              type: 'BOT_DIED',
              victimBotId: victim.botId,
              creditedBotId: bot.botId,
            })
          }
        }
      }

      bot.pc = pcAfter
    }

    // bullets advance + collide
    /** @type {typeof bullets} */
    const nextBullets = []

    for (const bullet of bullets) {
      const fromPos = clonePos(bullet.pos)
      const proposedTo = {
        x: round3(fromPos.x + bullet.vel.x),
        y: round3(fromPos.y + bullet.vel.y),
      }

      const wallHit = segmentHitsArenaWall(fromPos, proposedTo)

      /** @type {{ victim: any; hit: {t:number,pos:{x:number,y:number}} } | null} */
      let bestBotHit = null

      for (const bot of bots) {
        if (!bot.alive) continue
        if (bot.botId === bullet.ownerBotId) continue

        const min = {
          x: bot.pos.x - BOT_HALF_SIZE,
          y: bot.pos.y - BOT_HALF_SIZE,
        }
        const max = {
          x: bot.pos.x + BOT_HALF_SIZE,
          y: bot.pos.y + BOT_HALF_SIZE,
        }

        const hit = segmentIntersectsAabb(fromPos, proposedTo, min, max)
        if (!hit) continue

        if (!bestBotHit || hit.t < bestBotHit.hit.t) {
          bestBotHit = { victim: bot, hit }
        }
      }

      const botHitEarlier = bestBotHit && (!wallHit || bestBotHit.hit.t <= wallHit.t)

      if (botHitEarlier) {
        const victim = bestBotHit.victim
        const hit = bestBotHit.hit

        tickEvents.push({
          type: 'BULLET_MOVE',
          bulletId: bullet.bulletId,
          fromPos,
          toPos: clonePos(hit.pos),
        })

        tickEvents.push({
          type: 'BULLET_HIT',
          bulletId: bullet.bulletId,
          victimBotId: victim.botId,
          damage: BULLET_DAMAGE,
          hitPos: clonePos(hit.pos),
        })

        victim.hp = Math.max(0, victim.hp - BULLET_DAMAGE)

        tickEvents.push({
          type: 'DAMAGE',
          victimBotId: victim.botId,
          amount: BULLET_DAMAGE,
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
            creditedBotId: bullet.ownerBotId,
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

      if (wallHit) {
        tickEvents.push({
          type: 'BULLET_MOVE',
          bulletId: bullet.bulletId,
          fromPos,
          toPos: clonePos(wallHit.pos),
        })

        tickEvents.push({
          type: 'BULLET_DESPAWN',
          bulletId: bullet.bulletId,
          reason: 'WALL',
          pos: clonePos(wallHit.pos),
        })
        continue
      }

      // no collisions
      bullet.pos = proposedTo
      bullet.ttl--

      tickEvents.push({
        type: 'BULLET_MOVE',
        bulletId: bullet.bulletId,
        fromPos,
        toPos: clonePos(proposedTo),
      })

      if (bullet.ttl <= 0) {
        tickEvents.push({
          type: 'BULLET_DESPAWN',
          bulletId: bullet.bulletId,
          reason: 'TTL',
          pos: clonePos(proposedTo),
        })
        continue
      }

      nextBullets.push(bullet)
    }

    bullets = nextBullets

    // powerup pickups (after movement + projectiles)
    for (const bot of bots) {
      if (!bot.alive) continue

      let idx = -1
      for (let i = 0; i < powerups.length; i++) {
        const pPos = locToWorld(powerups[i].loc)
        if (
          Math.abs(bot.pos.x - pPos.x) <= BOT_HALF_SIZE &&
          Math.abs(bot.pos.y - pPos.y) <= BOT_HALF_SIZE
        ) {
          idx = i
          break
        }
      }

      if (idx < 0) continue

      const p = powerups[idx]
      powerups.splice(idx, 1)

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

    // powerup TTL despawn (end-of-tick maintenance)
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i]
      if (p.expiresAtTick > t) continue

      powerups.splice(i, 1)

      tickEvents.push({
        type: 'POWERUP_DESPAWN',
        powerupId: p.powerupId,
        reason: 'RULES',
      })
    }

    // powerup spawn timer + spawn (end-of-tick maintenance)
    powerupSpawnRemaining--
    const shouldSpawnPowerup = powerupSpawnRemaining <= 0

    if (shouldSpawnPowerup) {
      if (powerups.length >= POWERUP_MAX_ACTIVE) {
        powerupSpawnRemaining = 1
      } else {
        const occupiedKeys = new Set(powerups.map((p) => `${p.loc.sector}:${p.loc.zone}`))

        const candidates = POWERUP_ANCHORS.filter((loc) => {
          const k = `${loc.sector}:${loc.zone}`
          if (occupiedKeys.has(k)) return false

          const pos = locToWorld(loc)
          return !bots.some(
            (b) =>
              b.alive &&
              Math.abs(b.pos.x - pos.x) <= BOT_HALF_SIZE &&
              Math.abs(b.pos.y - pos.y) <= BOT_HALF_SIZE
          )
        })

        if (!candidates.length) {
          powerupSpawnRemaining = 1
        } else {
          const loc = rngChoice(rng, candidates)
          const kind = rngChoice(rng, POWERUP_TYPES)
          const powerupId = `P${++powerupCounter}`

          powerups.push({
            powerupId,
            type: kind,
            loc: { sector: loc.sector, zone: loc.zone },
            expiresAtTick: t + POWERUP_LIFETIME_TICKS,
          })

          tickEvents.push({
            type: 'POWERUP_SPAWN',
            powerupId,
            powerupType: kind,
            loc: { sector: loc.sector, zone: loc.zone },
          })

          powerupSpawnRemaining = rngInt(
            rng,
            POWERUP_SPAWN_INTERVAL_MIN_TICKS,
            POWERUP_SPAWN_INTERVAL_MAX_TICKS
          )
        }
      }
    }

    state.push({
      t,
      bots: bots.map((b) => ({
        botId: b.botId,
        pos: clonePos(b.pos),
        hp: b.hp,
        ammo: b.ammo,
        energy: b.energy,
        alive: b.alive,
        pc: b.pc,
      })),
      bullets: bullets.map((b) => ({
        bulletId: b.bulletId,
        ownerBotId: b.ownerBotId,
        pos: clonePos(b.pos),
        vel: { x: b.vel.x, y: b.vel.y },
      })),
      powerups: powerups.map((p) => ({
        powerupId: p.powerupId,
        type: p.type,
        loc: { sector: p.loc.sector, zone: p.loc.zone },
      })),
    })

    events.push(tickEvents)
  }

  return {
    schemaVersion: '0.2.0',
    rulesetVersion: '0.2.0',
    ticksPerSecond: 1,
    matchSeed: seed,
    tickCap,
    bots: headerBots,
    state,
    events,
  }
}
