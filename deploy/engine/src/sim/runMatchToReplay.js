import { EMPTY_LOADOUT, RULESET_VERSION, normalizeLoadout } from '../../../ruleset/index.js'

import { compileBotSource } from '../dsl/compileBotSource.js'
import { initBotVm, stepBotVm } from '../vm/botVm.js'

import {
  ARENA_MAX,
  ARENA_MIN,
  BOT_CENTER_MAX,
  BOT_CENTER_MIN,
  BOT_HALF_SIZE,
  BULLET_AMMO_COST,
  BULLET_COOLDOWN_TICKS,
  SLOT_IDS,
  WALL_BUMP_DAMAGE,
  BOT_BUMP_DAMAGE,
} from './constants.js'
import {
  botsOverlap,
  clonePos,
  dirFromDelta,
  locToWorld,
  manhattan,
  oppositeDir,
  scaleDeltaToMaxLen,
  sectorFromPos,
  zoneFromPos,
} from './arenaMath.js'
import { createBullet, stepBullets } from './bulletSim.js'
import { bresenhamPoints } from './bresenham.js'
import { createRng } from './prng.js'
import {
  findClosestPowerupLoc,
  initPowerupState,
  powerupExists,
  stepPowerupMaintenance,
  stepPowerupPickups,
} from './powerupSim.js'

const DEFAULT_TICKS_PER_SECOND = 1

const DEFAULT_APPEARANCE_BY_SLOT = {
  BOT1: { kind: 'COLOR', color: '#4ade80' },
  BOT2: { kind: 'COLOR', color: '#60a5fa' },
  BOT3: { kind: 'COLOR', color: '#f472b6' },
  BOT4: { kind: 'COLOR', color: '#fbbf24' },
}

const SPAWN_POS_BY_ID = {
  BOT1: { x: 16, y: 16 },
  BOT2: { x: 176, y: 16 },
  BOT3: { x: 16, y: 176 },
  BOT4: { x: 176, y: 176 },
}

const DEFAULT_LOADOUT = EMPTY_LOADOUT

// (Ruleset.md v1 recommended baseSpeed 16 - 1 equipped slot penalty 4 => 12.)
const BASE_SPEED_UNITS_PER_TICK = 12

// ARMOR speed penalty: >=20% (we use 25%): floor(base * 3/4)
const ARMOR_SPEED_NUM = 3
const ARMOR_SPEED_DEN = 4

// ARMOR damage reduction: amount - floor(amount/3)
const ARMOR_DAMAGE_DIV = 3

// Ruleset.md §0.1 recommended defaults.
const STALEMATE_GRACE_TICKS = 120
const STALEMATE_COUNTDOWN_TICKS = 30

// Stable v1 SAW numbers.
const SAW_DAMAGE = 6
const SAW_ENERGY_DRAIN = 2
const SAW_ATTACK_RANGE = BOT_HALF_SIZE * 2 + 2
const SAW_ATTACK_RANGE2 = SAW_ATTACK_RANGE * SAW_ATTACK_RANGE

const SHIELD_ENERGY_DRAIN = 2

function applyArmorMitigation(amount) {
  return amount - Math.floor(amount / ARMOR_DAMAGE_DIV)
}

function computeBotSpeedUnitsPerTick(bot) {
  if (!bot.armorEquipped) return BASE_SPEED_UNITS_PER_TICK
  return Math.floor((BASE_SPEED_UNITS_PER_TICK * ARMOR_SPEED_NUM) / ARMOR_SPEED_DEN)
}

function findSlotIndex(loadout, moduleId) {
  for (let i = 0; i < loadout.length; i++) {
    if (loadout[i] === moduleId) return i
  }
  return -1
}

/**
 * @param {{ seed: number|string, tickCap: number, bots: Array<{slotId: 'BOT1'|'BOT2'|'BOT3'|'BOT4', sourceText: string, loadout?: any}>, inactiveSlots?: Array<'BOT1'|'BOT2'|'BOT3'|'BOT4'> }} params
 */
export function runMatchToReplay(params) {
  const tickCapLimit = params.tickCap
  let tickCap = tickCapLimit
  const rng = createRng(params.seed)
  const inactiveSlots = new Set(Array.isArray(params.inactiveSlots) ? params.inactiveSlots.filter(isSlotId) : [])

  const headerBots = normalizeHeaderBots(params.bots)

  /** @type {Array<{botId:'BOT1'|'BOT2'|'BOT3'|'BOT4', pos:{x:number,y:number}, hp:number, ammo:number, energy:number, alive:boolean, lastDamageByBotId: 'BOT1'|'BOT2'|'BOT3'|'BOT4' | null, vm: any, slotCooldowns:[number,number,number], pendingMove:any,
  bumpedBotLastTick:boolean, bumpedBotThisTick:boolean, bumpedBotIdLastTick:('BOT1'|'BOT2'|'BOT3'|'BOT4'|null), bumpedBotIdThisTick:('BOT1'|'BOT2'|'BOT3'|'BOT4'|null), bumpedBotDirLastTick:any, bumpedBotDirThisTick:any,
  bumpedWallLastTick:boolean, bumpedWallThisTick:boolean, bumpedWallDirLastTick:any, bumpedWallDirThisTick:any,
  loadout:[any,any,any], bulletSlotIndex:number, sawSlotIndex:number, shieldSlotIndex:number, armorEquipped:boolean,
  sawActive:boolean, shieldActive:boolean}>} */
  const bots = SLOT_IDS.map((botId) => {
    const header = headerBots.find((b) => b.slotId === botId)

    const sourceText = header?.sourceText ?? ''
    const compiled = compileBotSource(sourceText)

    const loadout = header?.loadout ?? DEFAULT_LOADOUT

    const bulletSlotIndex = findSlotIndex(loadout, 'BULLET')
    const sawSlotIndex = findSlotIndex(loadout, 'SAW')
    const shieldSlotIndex = findSlotIndex(loadout, 'SHIELD')
    const armorEquipped = findSlotIndex(loadout, 'ARMOR') !== -1
    const inactive = inactiveSlots.has(botId)

    return {
      botId,
      pos: clonePos(SPAWN_POS_BY_ID[botId]),
      hp: inactive ? 0 : 100,
      ammo: inactive ? 0 : 100,
      energy: inactive ? 0 : 100,
      alive: !inactive,
      lastDamageByBotId: null,
      vm: initBotVm(compiled.program),
      slotCooldowns: [0, 0, 0],
      pendingMove: null,

      // Bump signals are computed during movement resolution and become visible
      // to the bot on the next tick (BotInstructions.md §6.3).
      bumpedBotLastTick: false,
      bumpedBotThisTick: false,
      bumpedBotIdLastTick: null,
      bumpedBotIdThisTick: null,
      bumpedBotDirLastTick: null,
      bumpedBotDirThisTick: null,

      bumpedWallLastTick: false,
      bumpedWallThisTick: false,
      bumpedWallDirLastTick: null,
      bumpedWallDirThisTick: null,

      loadout,
      bulletSlotIndex,
      sawSlotIndex,
      shieldSlotIndex,
      armorEquipped,

      sawActive: false,
      shieldActive: false,
    }
  })

  /** @type {Array<{bulletId:string, ownerBotId:'BOT1'|'BOT2'|'BOT3'|'BOT4', pos:{x:number,y:number}, vel:{x:number,y:number}, ttl:number}>} */
  let bullets = []
  let bulletCounter = 0

  const powerupState = initPowerupState(rng)

  const state = []
  const events = []

  state.push(snapshotState(0, bots, bullets, powerupState))
  events.push([])

  // Stalemate tracking (Ruleset.md §0.1.1).
  let ticksSinceLastBotDamage = 0
  /** @type {number | null} */
  let stalemateCountdownRemaining = null

  for (let t = 1; t <= tickCapLimit; t++) {
    /** @type {any[]} */
    const tickEvents = []

    // Reset per-tick bump flags (they become visible next tick via *LastTick).
    for (const b of bots) {
      b.bumpedBotThisTick = false
      b.bumpedBotIdThisTick = null
      b.bumpedBotDirThisTick = null

      b.bumpedWallThisTick = false
      b.bumpedWallDirThisTick = null
    }

    // 1) Bot VM instruction phase (BOT1..BOT4)
    for (const bot of bots) {
      if (!bot.alive) continue

      const observation = buildObservation(bot, bots, bullets, powerupState)

      const vmBefore = bot.vm
      const instrBefore = vmBefore?.program?.instructions?.[vmBefore.pc - 1] ?? { kind: 'INVALID' }
      const prevTargetSelector = vmBefore?.target?.botSelector ?? null
      const prevTargetBullet = vmBefore?.target?.bulletId ?? null

      const { vm: vmAfter, effects, debug } = stepBotVm(vmBefore, observation)
      bot.vm = vmAfter

      normalizeTargetRegister(bot, bots, prevTargetSelector, prevTargetBullet, bullets)

      // Track whether a USE_SLOT succeeded for BOT_EXEC reporting.
      let botExecResult = debug.executedKind === 'INVALID' ? 'NOP' : 'EXECUTED'
      /** @type {string | undefined} */
      let botExecReason

      for (const eff of effects) {
        if (eff.kind === 'MOVE_DIR' || eff.kind === 'MOVE') {
          bot.pendingMove = eff
          continue
        }

        if (eff.kind === 'SET_MOVE') {
          bot.vm.moveGoal = normalizeMoveTargetAtSetTime(eff.target, bot.pos)
          continue
        }

        if (eff.kind === 'CLEAR_MOVE') {
          bot.vm.moveGoal = null
          continue
        }

        if (eff.kind === 'MODULE_TOGGLE') {
          const wantsOn = Boolean(eff.on)

          if (eff.module === 'SAW') {
            if (bot.sawSlotIndex === -1) {
              botExecResult = 'NOP'
              botExecReason = 'NO_MODULE'
              continue
            }

            if (wantsOn && bot.energy <= 0) {
              botExecResult = 'NOP'
              botExecReason = 'NO_ENERGY'
              bot.sawActive = false
              continue
            }

            bot.sawActive = wantsOn
            continue
          }

          if (eff.module === 'SHIELD') {
            if (bot.shieldSlotIndex === -1) {
              botExecResult = 'NOP'
              botExecReason = 'NO_MODULE'
              continue
            }

            if (wantsOn && bot.energy <= 0) {
              botExecResult = 'NOP'
              botExecReason = 'NO_ENERGY'
              bot.shieldActive = false
              continue
            }

            bot.shieldActive = wantsOn
            continue
          }

          botExecResult = 'NOP'
          botExecReason = 'NO_MODULE'
          continue
        }

        if (eff.kind === 'STOP_SLOT') {
          const slotIndex = eff.slot === 1 ? 0 : eff.slot === 2 ? 1 : eff.slot === 3 ? 2 : -1
          const mod = slotIndex >= 0 ? bot.loadout[slotIndex] : null

          if (mod === 'SAW' && slotIndex === bot.sawSlotIndex) {
            bot.sawActive = false
            continue
          }

          if (mod === 'SHIELD' && slotIndex === bot.shieldSlotIndex) {
            bot.shieldActive = false
            continue
          }

          if (mod === 'ARMOR' || mod === 'BULLET') {
            botExecResult = 'NOP'
            botExecReason = 'NO_EFFECT'
            continue
          }

          botExecResult = 'NOP'
          botExecReason = 'NO_MODULE'
          continue
        }

        if (eff.kind === 'USE_SLOT') {
          const slotIndex = eff.slot === 1 ? 0 : eff.slot === 2 ? 1 : eff.slot === 3 ? 2 : -1
          const mod = slotIndex >= 0 ? bot.loadout[slotIndex] : null

          if (mod == null) {
            botExecResult = 'NOP'
            botExecReason = 'NO_MODULE'
            continue
          }

          if (mod === 'SHIELD') {
            if (bot.energy <= 0) {
              botExecResult = 'NOP'
              botExecReason = 'NO_ENERGY'
              bot.shieldActive = false
              continue
            }

            bot.shieldActive = true
            continue
          }

          if (mod === 'SAW') {
            if (bot.energy <= 0) {
              botExecResult = 'NOP'
              botExecReason = 'NO_ENERGY'
              bot.sawActive = false
              continue
            }

            bot.sawActive = true
            continue
          }

          if (mod === 'ARMOR') {
            botExecResult = 'NOP'
            botExecReason = 'NO_EFFECT'
            continue
          }

          if (mod !== 'BULLET') {
            botExecResult = 'NOP'
            botExecReason = 'NO_MODULE'
            continue
          }

          const r = attemptUseBullet(bot, slotIndex, eff.target, bots, bullets, ++bulletCounter, tickEvents)

          if (!r.ok) {
            botExecResult = 'NOP'
            botExecReason = r.reason
            bulletCounter--
          } else {
            bullets = r.bullets
            bot.slotCooldowns[slotIndex] = BULLET_COOLDOWN_TICKS
            bulletCounter = r.bulletCounter
          }

          continue
        }
      }

      if (debug.executedKind === 'INVALID') {
        botExecResult = 'NOP'
        botExecReason = 'INVALID_INSTR'
      }

      tickEvents.push({
        type: 'BOT_EXEC',
        botId: bot.botId,
        pcBefore: debug.pcBefore,
        pcAfter: debug.pcAfter,
        instrText: formatInstr(instrBefore),
        result: botExecResult,
        ...(botExecReason ? { reason: botExecReason } : {}),
      })
    }

    // 2) Toggle drains (SAW/SHIELD)
    stepToggleDrains(bots, tickEvents)

    // 3) Movement + collision resolution
    resolveMovement(bots, bullets, powerupState, tickEvents)

    // 4) SAW melee damage
    stepSawDamage(bots, tickEvents)

    // 5) Projectile updates (bullets)
    bullets = stepBullets(bullets, bots, tickEvents)

    // 6) Pickups
    stepPowerupPickups(powerupState, bots, tickEvents)

    // 8) End-of-tick maintenance
    for (const bot of bots) {
      bot.pendingMove = null
      for (let i = 0; i < bot.slotCooldowns.length; i++) {
        if (bot.slotCooldowns[i] > 0) bot.slotCooldowns[i]--
      }

      bot.bumpedBotLastTick = bot.bumpedBotThisTick
      bot.bumpedBotIdLastTick = bot.bumpedBotIdThisTick
      bot.bumpedBotDirLastTick = bot.bumpedBotDirThisTick

      bot.bumpedWallLastTick = bot.bumpedWallThisTick
      bot.bumpedWallDirLastTick = bot.bumpedWallDirThisTick
    }

    stepPowerupMaintenance(powerupState, bots, t, rng, tickEvents)

    // Target powerup invalidation: if the preferred type doesn't exist at end
    // of tick (after spawns/despawns), clear it.
    for (const bot of bots) {
      const type = bot.vm?.target?.powerupType
      if (!type) continue
      if (!powerupExists(powerupState, type)) bot.vm.target.powerupType = null
    }

    // --- Match end conditions (Ruleset.md §0.1) ---

    // Bot-vs-bot damage detection for stalemate tracking.
    const botDamageThisTick = tickEvents.some(
      (e) => e && e.type === 'DAMAGE' && typeof e.amount === 'number' && e.amount > 0 && e.sourceBotId
    )

    const aliveBotCount = bots.reduce((n, b) => (b.alive ? n + 1 : n), 0)

    if (botDamageThisTick) {
      ticksSinceLastBotDamage = 0
      stalemateCountdownRemaining = null
    } else {
      ticksSinceLastBotDamage++

      if (aliveBotCount >= 2) {
        if (stalemateCountdownRemaining == null && ticksSinceLastBotDamage === STALEMATE_GRACE_TICKS) {
          stalemateCountdownRemaining = STALEMATE_COUNTDOWN_TICKS
        } else if (stalemateCountdownRemaining != null) {
          stalemateCountdownRemaining--
        }
      } else {
        stalemateCountdownRemaining = null
      }
    }

    /** @type {string | null} */
    let endReason = null

    if (aliveBotCount === 0) {
      endReason = 'ALL_DEAD'
    } else if (aliveBotCount === 1) {
      endReason = 'LAST_BOT_ALIVE'
    } else if (stalemateCountdownRemaining != null && stalemateCountdownRemaining <= 0) {
      endReason = 'STALEMATE'
    } else if (t === tickCapLimit) {
      endReason = 'TICK_CAP'
    }

    if (endReason) {
      tickEvents.push({ type: 'MATCH_END', endReason })
    }

    state.push(snapshotState(t, bots, bullets, powerupState))
    events.push(tickEvents)

    if (endReason) {
      tickCap = t
      break
    }
  }

  return {
    schemaVersion: '0.2.0',
    rulesetVersion: RULESET_VERSION,
    ticksPerSecond: DEFAULT_TICKS_PER_SECOND,
    matchSeed: params.seed,
    tickCap,
    bots: headerBots,
    state,
    events,
  }
}

function snapshotState(t, bots, bullets, powerupState) {
  return {
    t,
    bots: bots.map((b) => ({
      botId: b.botId,
      pos: clonePos(b.pos),
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
      pc: b.vm?.pc ?? 1,
      targetBulletId: typeof b.vm?.target?.bulletId === 'string' ? b.vm.target.bulletId : null,
    })),
    bullets: bullets.map((b) => ({
      bulletId: b.bulletId,
      ownerBotId: b.ownerBotId,
      pos: clonePos(b.pos),
      vel: clonePos(b.vel),
    })),
    powerups: powerupState.powerups.map((p) => ({
      powerupId: p.powerupId,
      type: p.type,
      loc: { sector: p.loc.sector, zone: p.loc.zone },
    })),
  }
}

function defaultHeaderBot(slotId) {
  return {
    slotId,
    displayName: slotId,
    appearance: DEFAULT_APPEARANCE_BY_SLOT[slotId] ?? { kind: 'COLOR', color: '#e2e8f0' },
    sourceText: '',
    loadout: DEFAULT_LOADOUT,
  }
}

function isSlotId(v) {
  return v === 'BOT1' || v === 'BOT2' || v === 'BOT3' || v === 'BOT4'
}

function normalizeHeaderBots(botsInput) {
  if (!Array.isArray(botsInput)) return SLOT_IDS.map(defaultHeaderBot)

  const byId = new Map(botsInput.map((b) => [b?.slotId, b]))

  return SLOT_IDS.map((slotId) => {
    const b = byId.get(slotId)
    const sourceText = typeof b?.sourceText === 'string' ? b.sourceText : ''

    const { loadout, issues } = normalizeLoadout(b?.loadout)

    return {
      slotId,
      displayName: slotId,
      appearance: DEFAULT_APPEARANCE_BY_SLOT[slotId] ?? { kind: 'COLOR', color: '#e2e8f0' },
      sourceText,
      loadout,
      ...(issues.length ? { loadoutIssues: issues } : {}),
    }
  })
}

function buildObservation(bot, bots, bullets, powerupState) {
  const zone = zoneFromPos(bot.pos)
  const sector = sectorFromPos(bot.pos)
  const closestBotDist = distToClosestBot(bot, bots)

  const bulletThreat = computeBulletThreat(bot.botId, sector, bullets)

  const botSectors = {
    BOT1: sectorFromPos(bots[0]?.pos ?? bot.pos),
    BOT2: sectorFromPos(bots[1]?.pos ?? bot.pos),
    BOT3: sectorFromPos(bots[2]?.pos ?? bot.pos),
    BOT4: sectorFromPos(bots[3]?.pos ?? bot.pos),
  }

  const targetBotId = bot.vm?.target?.botSelector
  const targetBot =
    targetBotId === 'BOT1' || targetBotId === 'BOT2' || targetBotId === 'BOT3' || targetBotId === 'BOT4'
      ? botsById(bots, targetBotId)
      : null

  const targetBulletId = bot.vm?.target?.bulletId
  const targetBullet = typeof targetBulletId === 'string' ? bullets.find((b) => b?.bulletId === targetBulletId) : null

  const timers = bot.vm?.timers ?? { 1: 0, 2: 0, 3: 0 }

  const targetPowerupType = bot.vm?.target?.powerupType

  return {
    vars: {
      HEALTH: bot.hp,
      AMMO: bot.ammo,
      ENERGY: bot.energy,
      TARGET_HEALTH: targetBot && targetBot.alive ? targetBot.hp : 0,
    },

    // Location
    sector,
    zone,

    // Bot/sector convenience
    botSectors,

    botsAlive: {
      BOT1: bots[0]?.alive ?? false,
      BOT2: bots[1]?.alive ?? false,
      BOT3: bots[2]?.alive ?? false,
      BOT4: bots[3]?.alive ?? false,
    },

    powerupExists: (type) => powerupExists(powerupState, type),

    // Distances (Manhattan)
    distToClosestBot: closestBotDist,
    distToBot: (botId) => {
      const other = botsById(bots, botId)
      if (!other) return 999
      if (!other.alive) return 999
      return manhattan(bot.pos, other.pos)
    },
    distToTargetBot: () => {
      if (targetBot && targetBot.alive) return manhattan(bot.pos, targetBot.pos)
      return 999
    },
    distToTargetBullet: () => {
      if (targetBullet) return manhattan(bot.pos, targetBullet.pos)
      return 999
    },
    distToSector: (s) => {
      const pos = locToWorld({ sector: Math.floor(s), zone: 0 })
      return manhattan(bot.pos, pos)
    },
    distToSectorZone: (s, z) => {
      const pos = locToWorld({ sector: Math.floor(s), zone: Math.floor(z) })
      return manhattan(bot.pos, pos)
    },

    // Powerups
    distToClosestPowerup: (type) => {
      const loc = findClosestPowerupLoc(powerupState, bot.pos, type)
      if (!loc) return 999
      return manhattan(bot.pos, locToWorld(loc))
    },
    hasTargetPowerup: () => Boolean(targetPowerupType && powerupExists(powerupState, targetPowerupType)),
    powerupInSector: (type, s, zOrNull) => {
      const sectorN = Math.floor(s)
      const zoneN = zOrNull == null ? null : Math.floor(zOrNull)
      for (const p of powerupState.powerups) {
        if (!p) continue
        if (p.type !== type) continue
        if (p.loc.sector !== sectorN) continue
        if (zoneN == null) return true
        if (p.loc.zone === zoneN) return true
      }
      return false
    },

    // Walls / arena edges (distance from bot collision box)
    distToArenaEdge: (dir) => {
      if (dir === 'UP') return Math.max(0, bot.pos.y - BOT_HALF_SIZE - ARENA_MIN)
      if (dir === 'DOWN') return Math.max(0, ARENA_MAX - (bot.pos.y + BOT_HALF_SIZE))
      if (dir === 'LEFT') return Math.max(0, bot.pos.x - BOT_HALF_SIZE - ARENA_MIN)
      if (dir === 'RIGHT') return Math.max(0, ARENA_MAX - (bot.pos.x + BOT_HALF_SIZE))
      return 999
    },

    timers: { T1: timers[1] ?? 0, T2: timers[2] ?? 0, T3: timers[3] ?? 0 },

    // Bullet threat sensors.
    bulletInSameSector: bulletThreat.sameSector,
    bulletInAdjSector: bulletThreat.adjSector,

    // Exposed for HAS_TARGET_BOT() / HAS_TARGET_BULLET() (see botVm.js).
    hasTargetBot: () => Boolean(targetBot && targetBot.alive),
    hasTargetBullet: () => Boolean(targetBullet),

    // Slots
    hasModule: (slot) => {
      const idx = slot === 1 ? 0 : slot === 2 ? 1 : slot === 3 ? 2 : -1
      if (idx < 0) return false
      return bot.loadout[idx] != null
    },
    cooldownRemaining: (slot) => {
      const idx = slot === 1 ? 0 : slot === 2 ? 1 : slot === 3 ? 2 : -1
      if (idx < 0) return 0
      return bot.slotCooldowns[idx] ?? 0
    },
    slotReady: (slot) => {
      const idx = slot === 1 ? 0 : slot === 2 ? 1 : slot === 3 ? 2 : -1
      if (idx < 0) return false

      const mod = bot.loadout[idx]

      if (mod === 'ARMOR') return true
      if (mod === 'SHIELD') return bot.energy > 0
      if (mod === 'SAW') return bot.energy > 0

      if (mod !== 'BULLET') return false
      if (bot.slotCooldowns[idx] > 0) return false
      return bot.ammo >= BULLET_AMMO_COST
    },
    slotActive: (slot) => {
      const idx = slot === 1 ? 0 : slot === 2 ? 1 : slot === 3 ? 2 : -1
      if (idx < 0) return false
      const mod = bot.loadout[idx]
      if (mod === 'SHIELD' && idx === bot.shieldSlotIndex) return bot.shieldActive
      if (mod === 'SAW' && idx === bot.sawSlotIndex) return bot.sawActive
      return false
    },

    // Bumps (visible from last tick)
    bumpedBot: bot.bumpedBotLastTick,
    bumpedBotId: bot.bumpedBotIdLastTick,
    bumpedBotDir: bot.bumpedBotDirLastTick,
    bumpedWall: bot.bumpedWallLastTick,
    bumpedWallDir: bot.bumpedWallDirLastTick,
  }
}

function distToClosestBot(bot, bots) {
  let best = 999
  for (const other of bots) {
    if (!other.alive) continue
    if (other.botId === bot.botId) continue

    const d = manhattan(bot.pos, other.pos)
    if (d < best) best = d
  }
  return best
}

function computeBulletThreat(selfBotId, selfSector, bullets) {
  let sameSector = false
  let adjSector = false

  for (const b of bullets) {
    if (!b) continue
    if (b.ownerBotId === selfBotId) continue

    const s = sectorFromPos(b.pos)

    if (s === selfSector) {
      sameSector = true
      break
    }

    if (isAdjSector(selfSector, s)) adjSector = true
  }

  return { sameSector, adjSector }
}

function isAdjSector(a, b) {
  if (a === b) return false

  const ax = ((a - 1) % 3) + 1
  const ay = Math.floor((a - 1) / 3) + 1
  const bx = ((b - 1) % 3) + 1
  const by = Math.floor((b - 1) / 3) + 1

  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1
}

function normalizeMoveTargetAtSetTime(target, pos) {
  if (!target || typeof target !== 'object') return target

  if (target.kind === 'ZONE_IN_CURRENT_SECTOR') {
    const sector = sectorFromPos(pos)
    return { kind: 'SECTOR', sector, zone: target.zone }
  }

  return target
}

export function findClosestEnemyBullet(selfBotId, selfPos, bullets) {
  /** @type {{ b: any, d: number } | null} */
  let best = null

  for (const b of bullets) {
    if (!b) continue
    if (b.ownerBotId === selfBotId) continue

    const d = manhattan(selfPos, b.pos)

    // Tie-break: bullet creation order (lowest numeric bullet id: B1 < B2 < ...).
    // Do NOT use lexicographic compare (B10 would sort before B2).
    const thisIdN = parseBulletIdNumber(b.bulletId)
    const bestIdN = best ? parseBulletIdNumber(best.b.bulletId) : null

    if (!best || d < best.d || (d === best.d && thisIdN != null && bestIdN != null && thisIdN < bestIdN)) {
      best = { b, d }
    }
  }

  return best?.b ?? null
}

function parseBulletIdNumber(bulletId) {
  if (typeof bulletId !== 'string') return null
  const m = bulletId.match(/\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Normalize the bot target registers after a bot executes a target-selection instruction.
 */
function normalizeTargetRegister(bot, bots, prevTargetSelector = null, prevBulletSelector = null, bullets = []) {
  const selector = bot?.vm?.target?.botSelector
  const bulletSelector = bot?.vm?.target?.bulletId

  if (bulletSelector != null && bulletSelector !== prevBulletSelector) {
    if (bulletSelector === 'CLOSEST_BULLET') {
      const b = findClosestEnemyBullet(bot.botId, bot.pos, bullets)
      bot.vm.target.bulletId = b ? b.bulletId : null
    } else {
      const exists = bullets.some((b) => b && b.bulletId === bulletSelector)
      if (!exists) bot.vm.target.bulletId = null
    }
  }

  if (selector == null) return

  // Concrete ids already.
  if (selector === 'BOT1' || selector === 'BOT2' || selector === 'BOT3' || selector === 'BOT4') return

  if (selector === 'CLOSEST_BOT') {
    const b = findClosestLivingBot(bot.botId, bot.pos, bots)
    bot.vm.target.botSelector = b ? b.botId : null
    return
  }

  if (selector === 'LOWEST_HEALTH_BOT') {
    const b = findLowestHealthLivingBot(bot.botId, bots)
    bot.vm.target.botSelector = b ? b.botId : null
    return
  }

  if (selector === 'NEXT') {
    bot.vm.target.botSelector = nextTargetId(bot.botId, prevTargetSelector)
    return
  }

  if (selector === 'NEXT_IF_DEAD') {
    const current = prevTargetSelector
    const currentBot =
      current === 'BOT1' || current === 'BOT2' || current === 'BOT3' || current === 'BOT4'
        ? botsById(bots, current)
        : null

    if (currentBot && currentBot.alive) {
      bot.vm.target.botSelector = current
    } else {
      bot.vm.target.botSelector = nextTargetId(bot.botId, prevTargetSelector)
    }
    return
  }

  bot.vm.target.botSelector = null
}

function nextTargetId(selfId, currentTargetId) {
  const order = SLOT_IDS.filter((id) => id !== selfId)
  const idx = currentTargetId && order.includes(currentTargetId) ? order.indexOf(currentTargetId) : -1
  return order[(idx + 1) % order.length]
}

function resolveMovement(bots, bullets, powerupState, tickEvents) {
  // Apply at most one bump-damage instance per bot-pair per tick.
  const bumpDamagePairs = new Set()

  for (const bot of bots) {
    if (!bot.alive) continue

    const move = bot.pendingMove

    /** @type {{ dx:number, dy:number, dir: any } | null} */
    let request = null
    let requestFromGoal = false

    if (move) {
      request = resolveMoveEffect(bot, move, bots, bullets, powerupState)
    } else if (bot.vm?.moveGoal) {
      requestFromGoal = true
      const speed = computeBotSpeedUnitsPerTick(bot)
      request = resolveMoveTarget(bot, bot.vm.moveGoal, bots, bullets, powerupState, true, speed)
    }

    if (!request) continue

    const fromPos = clonePos(bot.pos)

    // Wall clamp phase.
    const candidate = {
      x: bot.pos.x + request.dx,
      y: bot.pos.y + request.dy,
    }

    const clamped = {
      x: Math.max(BOT_CENTER_MIN, Math.min(BOT_CENTER_MAX, candidate.x)),
      y: Math.max(BOT_CENTER_MIN, Math.min(BOT_CENTER_MAX, candidate.y)),
    }

    const bumpedWallFromClamp = clamped.x !== candidate.x || clamped.y !== candidate.y

    // Bot-bot overlap check along the movement segment.
    /** @type {any | null} */
    let overlapped = null

    let finalPos = clamped

    const segmentPoints = bresenhamPoints(fromPos, clamped)
    let lastSafePos = fromPos

    for (const p of segmentPoints) {
      /** @type {any | null} */
      let atPoint = null

      for (const other of bots) {
        if (!other.alive) continue
        if (other.botId === bot.botId) continue
        if (!botsOverlap(p, other.pos)) continue

        if (!atPoint || other.botId < atPoint.botId) atPoint = other
      }

      if (atPoint) {
        overlapped = atPoint
        finalPos = lastSafePos
        break
      }

      lastSafePos = p
    }

    const bumpedWall = !overlapped && bumpedWallFromClamp

    if (overlapped) {
      tickEvents.push({
        type: 'BUMP_BOT',
        botId: bot.botId,
        otherBotId: overlapped.botId,
        dir: request.dir,
      })

      tickEvents.push({
        type: 'BUMP_BOT',
        botId: overlapped.botId,
        otherBotId: bot.botId,
        dir: oppositeDir(request.dir),
      })

      bot.bumpedBotThisTick = true
      bot.bumpedBotIdThisTick = overlapped.botId
      bot.bumpedBotDirThisTick = request.dir

      overlapped.bumpedBotThisTick = true
      overlapped.bumpedBotIdThisTick = bot.botId
      overlapped.bumpedBotDirThisTick = oppositeDir(request.dir)

      const a = bot.botId
      const b = overlapped.botId
      const key = a < b ? `${a}|${b}` : `${b}|${a}`

      if (!bumpDamagePairs.has(key)) {
        bumpDamagePairs.add(key)
        applyBotBumpDamage(bot, overlapped, tickEvents, key)
      }
    }

    bot.pos = finalPos

    if (fromPos.x !== bot.pos.x || fromPos.y !== bot.pos.y) {
      tickEvents.push({
        type: 'BOT_MOVED',
        botId: bot.botId,
        fromPos,
        toPos: clonePos(bot.pos),
        dir: request.dir,
      })
    }

    if (bumpedWall) {
      applyWallBumpDamage(bot, request.dir, tickEvents)
    }

    // Goal completion.
    if (requestFromGoal && bot.vm?.moveGoal && bot.vm.moveGoal.kind === 'SECTOR') {
      const goalPos = resolvePointGoalPos(bot.vm.moveGoal)
      if (goalPos && bot.pos.x === goalPos.x && bot.pos.y === goalPos.y) {
        bot.vm.moveGoal = null
      }
    }
  }
}

function applyWallBumpDamage(bot, dir, tickEvents) {
  bot.bumpedWallThisTick = true
  bot.bumpedWallDirThisTick = dir

  const raw = WALL_BUMP_DAMAGE
  const damage = bot.armorEquipped ? applyArmorMitigation(raw) : raw

  tickEvents.push({
    type: 'BUMP_WALL',
    botId: bot.botId,
    dir,
    damage,
  })

  bot.hp = Math.max(0, bot.hp - damage)

  tickEvents.push({
    type: 'DAMAGE',
    victimBotId: bot.botId,
    amount: damage,
    source: 'ENV',
    kind: 'BUMP_WALL',
  })

  if (bot.hp <= 0 && bot.alive) {
    bot.alive = false
    tickEvents.push({
      type: 'BOT_DIED',
      victimBotId: bot.botId,
      ...(bot.lastDamageByBotId ? { creditedBotId: bot.lastDamageByBotId } : {}),
    })
  }
}

function applyBotBumpDamage(botA, botB, tickEvents, pairKey) {
  if (!BOT_BUMP_DAMAGE || BOT_BUMP_DAMAGE <= 0) return

  const raw = BOT_BUMP_DAMAGE

  const dmgA = botA.armorEquipped ? applyArmorMitigation(raw) : raw

  botA.lastDamageByBotId = botB.botId
  botA.hp = Math.max(0, botA.hp - dmgA)

  tickEvents.push({
    type: 'DAMAGE',
    victimBotId: botA.botId,
    amount: dmgA,
    source: 'BOT',
    sourceBotId: botB.botId,
    kind: 'BUMP_BOT',
    sourceRef: { type: 'BUMP_BOT', id: pairKey },
  })

  if (botA.hp <= 0 && botA.alive) {
    botA.alive = false
    tickEvents.push({
      type: 'BOT_DIED',
      victimBotId: botA.botId,
      creditedBotId: botA.lastDamageByBotId,
    })
  }

  const dmgB = botB.armorEquipped ? applyArmorMitigation(raw) : raw

  botB.lastDamageByBotId = botA.botId
  botB.hp = Math.max(0, botB.hp - dmgB)

  tickEvents.push({
    type: 'DAMAGE',
    victimBotId: botB.botId,
    amount: dmgB,
    source: 'BOT',
    sourceBotId: botA.botId,
    kind: 'BUMP_BOT',
    sourceRef: { type: 'BUMP_BOT', id: pairKey },
  })

  if (botB.hp <= 0 && botB.alive) {
    botB.alive = false
    tickEvents.push({
      type: 'BOT_DIED',
      victimBotId: botB.botId,
      creditedBotId: botB.lastDamageByBotId,
    })
  }
}

function resolveMoveEffect(bot, move, bots, bullets, powerupState) {
  const speed = computeBotSpeedUnitsPerTick(bot)

  if (move.kind === 'MOVE_DIR') {
    const { dx, dy } = deltaForMoveDir(move.dir, speed)
    return { dx, dy, dir: move.dir }
  }

  if (move.kind === 'MOVE') {
    const target = normalizeMoveTargetAtSetTime(move.target, bot.pos)
    return resolveMoveTarget(bot, target, bots, bullets, powerupState, false, speed)
  }

  return null
}

function resolveMoveTarget(bot, target, bots, bullets, powerupState, clearGoalOnInvalid, speed) {
  if (!target || typeof target !== 'object') return null

  if (target.kind === 'TARGET' || target.kind === 'TARGET_AWAY') {
    const botTargetId = bot.vm?.target?.botSelector
    const botTarget =
      botTargetId === 'BOT1' || botTargetId === 'BOT2' || botTargetId === 'BOT3' || botTargetId === 'BOT4'
        ? botsById(bots, botTargetId)
        : null

    /** @type {{x:number,y:number} | null} */
    let goalPos = null

    if (botTarget && botTarget.alive) goalPos = botTarget.pos

    const bulletTargetId = bot.vm?.target?.bulletId
    const bulletTarget =
      !goalPos && typeof bulletTargetId === 'string' ? bullets.find((b) => b && b.bulletId === bulletTargetId) : null

    if (!goalPos && bulletTarget) goalPos = bulletTarget.pos

    const type = bot.vm?.target?.powerupType
    if (!goalPos && type) {
      const loc = findClosestPowerupLoc(powerupState, bot.pos, type)
      if (loc) goalPos = locToWorld(loc)
    }

    if (goalPos) {
      const dx = target.kind === 'TARGET' ? goalPos.x - bot.pos.x : bot.pos.x - goalPos.x
      const dy = target.kind === 'TARGET' ? goalPos.y - bot.pos.y : bot.pos.y - goalPos.y
      const scaled = scaleDeltaToMaxLen(dx, dy, speed)
      return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
    }

    if (clearGoalOnInvalid) bot.vm.moveGoal = null
    return null
  }

  if (target.kind === 'BOT') {
    const botTarget = resolveBotTargetToken(bot, target.token, bots)

    if (!botTarget || !botTarget.alive) {
      if (clearGoalOnInvalid) bot.vm.moveGoal = null
      return null
    }

    const dx = botTarget.pos.x - bot.pos.x
    const dy = botTarget.pos.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, speed)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'POWERUP') {
    const loc = findClosestPowerupLoc(powerupState, bot.pos, target.type)
    if (!loc) {
      if (clearGoalOnInvalid) bot.vm.moveGoal = null
      return null
    }
    const pos = locToWorld(loc)
    const dx = pos.x - bot.pos.x
    const dy = pos.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, speed)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'SECTOR') {
    const goalPos = resolvePointGoalPos(target)
    if (!goalPos) return null

    const dx = goalPos.x - bot.pos.x
    const dy = goalPos.y - bot.pos.y

    const scaled = scaleDeltaToMaxLen(dx, dy, speed)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'ARENA_EDGE') {
    let goal = clonePos(bot.pos)
    if (target.dir === 'UP') goal = { x: bot.pos.x, y: BOT_CENTER_MIN }
    if (target.dir === 'DOWN') goal = { x: bot.pos.x, y: BOT_CENTER_MAX }
    if (target.dir === 'LEFT') goal = { x: BOT_CENTER_MIN, y: bot.pos.y }
    if (target.dir === 'RIGHT') goal = { x: BOT_CENTER_MAX, y: bot.pos.y }

    const dx = goal.x - bot.pos.x
    const dy = goal.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, speed)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  return null
}

function resolvePointGoalPos(target) {
  if (target.kind !== 'SECTOR') return null

  const sector = Math.max(1, Math.min(9, Math.floor(target.sector)))
  const zone = target.zone ? Math.max(1, Math.min(4, Math.floor(target.zone))) : 0
  return locToWorld({ sector, zone })
}

function deltaForMoveDir(dir, speed) {
  const d = Math.floor((speed * 7071 + 5000) / 10000)

  switch (dir) {
    case 'UP':
      return { dx: 0, dy: -speed }
    case 'DOWN':
      return { dx: 0, dy: speed }
    case 'LEFT':
      return { dx: -speed, dy: 0 }
    case 'RIGHT':
      return { dx: speed, dy: 0 }
    case 'UP_LEFT':
      return { dx: -d, dy: -d }
    case 'UP_RIGHT':
      return { dx: d, dy: -d }
    case 'DOWN_LEFT':
      return { dx: -d, dy: d }
    case 'DOWN_RIGHT':
      return { dx: d, dy: d }
    default:
      return { dx: 0, dy: 0 }
  }
}

function resolveBotTargetToken(bot, token, bots) {
  if (!token) return null

  if (token === 'TARGET') {
    const id = bot.vm?.target?.botSelector
    return id === 'BOT1' || id === 'BOT2' || id === 'BOT3' || id === 'BOT4' ? botsById(bots, id) : null
  }

  if (token === 'BOT1' || token === 'BOT2' || token === 'BOT3' || token === 'BOT4') {
    return botsById(bots, token)
  }

  if (token === 'CLOSEST_BOT') return findClosestLivingBot(bot.botId, bot.pos, bots)

  if (token === 'LOWEST_HEALTH_BOT') return findLowestHealthLivingBot(bot.botId, bots)

  return null
}

function findClosestLivingBot(fromId, fromPos, bots) {
  /** @type {{ bot: any, d: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue
    const d = manhattan(fromPos, b.pos)
    if (!best || d < best.d || (d === best.d && b.botId < best.bot.botId)) best = { bot: b, d }
  }

  return best?.bot ?? null
}

function findLowestHealthLivingBot(fromId, bots) {
  /** @type {any | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue

    if (!best || b.hp < best.hp || (b.hp === best.hp && b.botId < best.botId)) best = b
  }

  return best
}

function attemptUseBullet(bot, slotIndex, targetToken, bots, bullets, nextBulletId, tickEvents) {
  if (slotIndex < 0 || slotIndex > 2) return { ok: false, reason: 'NO_MODULE' }
  if (bot.loadout[slotIndex] !== 'BULLET') return { ok: false, reason: 'NO_MODULE' }
  if (bot.slotCooldowns[slotIndex] > 0) return { ok: false, reason: 'COOLDOWN' }
  if (bot.ammo < BULLET_AMMO_COST) return { ok: false, reason: 'NO_AMMO' }

  const isBotKind =
    targetToken === 'TARGET' ||
    targetToken === 'CLOSEST_BOT' ||
    targetToken === 'LOWEST_HEALTH_BOT' ||
    targetToken === 'BOT1' ||
    targetToken === 'BOT2' ||
    targetToken === 'BOT3' ||
    targetToken === 'BOT4'

  if (!isBotKind) return { ok: false, reason: 'INVALID_TARGET_KIND' }

  const targetBot = resolveBotTargetToken(bot, targetToken, bots)
  if (!targetBot || !targetBot.alive) return { ok: false, reason: 'INVALID_TARGET' }

  const bullet = createBullet(bot, targetBot)
  const bulletId = `B${nextBulletId}`

  bullet.bulletId = bulletId

  bot.ammo -= BULLET_AMMO_COST

  tickEvents.push({
    type: 'RESOURCE_DELTA',
    botId: bot.botId,
    ammoDelta: -BULLET_AMMO_COST,
    energyDelta: 0,
    healthDelta: 0,
    cause: 'SHOOT',
  })

  tickEvents.push({
    type: 'BULLET_SPAWN',
    bulletId,
    ownerBotId: bot.botId,
    pos: clonePos(bullet.pos),
    vel: clonePos(bullet.vel),
    targetBotId: targetBot.botId,
    targetPos: clonePos(targetBot.pos),
  })

  return {
    ok: true,
    bullets: [...bullets, bullet],
    bulletCounter: nextBulletId,
  }
}

function formatInstr(instr) {
  const kind = instr?.kind ?? 'INVALID'

  if (kind === 'MOVE_DIR') return `MOVE ${instr.dir}`
  if (kind === 'SET_MOVE') return `SET_MOVE ${formatMoveTarget(instr.target)}`
  if (kind === 'MOVE') return `MOVE ${formatMoveTarget(instr.target)}`
  if (kind === 'CLEAR_MOVE') return 'CLEAR_MOVE'

  if (kind === 'SET_TARGET_BOT') return `SET_TARGET ${instr.selector}`
  if (kind === 'SET_TARGET_BULLET') return `SET_TARGET_BULLET ${instr.selector}`
  if (kind === 'SET_TARGET_POWERUP') return `TARGET_POWERUP ${instr.type}`
  if (kind === 'CLEAR_TARGET') return `CLEAR_TARGET ${instr.which ?? 'ALL'}`

  if (kind === 'USE_SLOT') return `USE_SLOT${instr.slot} ${instr.target}`
  if (kind === 'STOP_SLOT') return `STOP_SLOT${instr.slot}`
  if (kind === 'MODULE_TOGGLE') return `${instr.module} ${instr.on ? 'ON' : 'OFF'}`

  if (kind === 'WAIT') return `WAIT ${instr.ticks}`
  if (kind === 'SET_TIMER') return `SET_TIMER T${instr.timer} ${instr.ticks}`
  if (kind === 'CLEAR_TIMER') return `CLEAR_TIMER T${instr.timer}`

  if (kind === 'JUMP') return `JUMP ${instr.targetPc}`
  if (kind === 'IF_JUMP') return 'IF_JUMP'
  if (kind === 'IF_DO') return 'IF_DO'

  if (kind === 'NOP') return 'NOP'
  return kind
}

function formatMoveTarget(target) {
  if (!target || typeof target !== 'object') return ''

  if (target.kind === 'TARGET') return 'TARGET'
  if (target.kind === 'TARGET_AWAY') return 'TARGET_AWAY'
  if (target.kind === 'BOT') return `BOT ${target.token}`
  if (target.kind === 'POWERUP') return `POWERUP ${target.type}`
  if (target.kind === 'SECTOR') return target.zone ? `SECTOR ${target.sector} ZONE ${target.zone}` : `SECTOR ${target.sector}`
  if (target.kind === 'ZONE_IN_CURRENT_SECTOR') return `ZONE ${target.zone}`
  if (target.kind === 'ARENA_EDGE') return `ARENA_EDGE ${target.dir}`
  return target.kind
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

function stepToggleDrains(bots, tickEvents) {
  for (const bot of bots) {
    if (!bot.alive) continue

    if (bot.energy <= 0) {
      bot.sawActive = false
      bot.shieldActive = false
      continue
    }

    if (bot.sawActive) {
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
        bot.shieldActive = false
        continue
      }
    }

    if (bot.shieldActive) {
      const drain = Math.min(SHIELD_ENERGY_DRAIN, bot.energy)
      bot.energy -= drain

      tickEvents.push({
        type: 'RESOURCE_DELTA',
        botId: bot.botId,
        ammoDelta: 0,
        energyDelta: -drain,
        healthDelta: 0,
        cause: 'SHIELD_DRAIN',
      })

      if (bot.energy <= 0) {
        bot.sawActive = false
        bot.shieldActive = false
      }
    }
  }
}

function stepSawDamage(bots, tickEvents) {
  for (const bot of bots) {
    if (!bot.alive) continue
    if (!bot.sawActive) continue
    if (bot.energy <= 0) continue

    const victim = findClosestLivingBotInSawRange(bot.botId, bot.pos, bots)
    if (!victim) continue

    const raw = SAW_DAMAGE
    const damage = victim.armorEquipped ? applyArmorMitigation(raw) : raw

    victim.lastDamageByBotId = bot.botId
    victim.hp = Math.max(0, victim.hp - damage)

    tickEvents.push({
      type: 'DAMAGE',
      victimBotId: victim.botId,
      amount: damage,
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
        creditedBotId: victim.lastDamageByBotId,
      })
    }
  }
}

function findClosestLivingBotInSawRange(fromId, fromPos, bots) {
  /** @type {{ bot: any, d2: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue

    const dx = fromPos.x - b.pos.x
    const dy = fromPos.y - b.pos.y
    const d2 = dx * dx + dy * dy

    if (d2 > SAW_ATTACK_RANGE2) continue

    if (!best || d2 < best.d2 || (d2 === best.d2 && b.botId < best.bot.botId)) best = { bot: b, d2 }
  }

  return best?.bot ?? null
}
