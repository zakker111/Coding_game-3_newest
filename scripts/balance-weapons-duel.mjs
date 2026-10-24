// Weapon duel harness (ruleset 0.3.0 balance).
//
// Each attacker runs a minimal, weapon-appropriate program against a passive
// dummy (no loadout, WAIT loop). Isolating one weapon per run removes table-mate
// noise from scripts/balance-report.mjs, so per-module damage and time-to-kill
// can be compared directly.
//
// Two matchups:
//   passive: attacker vs WAIT-loop dummy (per-weapon damage and time-to-kill).
//   active:  attacker vs a BULLET hunter that moves, targets and fires back
//            (win rate and HP left; this is where CLOAK can matter).
//
// Usage: node scripts/balance-weapons-duel.mjs   (env: DUEL_SEEDS=20, DUEL_TICK_CAP=240)

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const { runMatchToReplay } = await import(
  pathToFileURL(path.join(repoRoot, 'packages/engine/src/index.js')).href
)

const SEEDS = Number.parseInt(process.env.DUEL_SEEDS || '20', 10)
const TICK_CAP = Number.parseInt(process.env.DUEL_TICK_CAP || '240', 10)

const DUMMY = { slotId: 'BOT2', loadout: [null, null, null], sourceText: 'LABEL LOOP\nWAIT 10\nGOTO LOOP\n' }

// Weapon-specific attacker programs. Each one approaches the dummy and uses the
// module the way the matching example bot does.
const PROGRAMS = {
  BULLET: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 50) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 2) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
  SNIPER: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 6) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
  ROCKET: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 8) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
  GRENADE: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 70) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 6) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
  RAILGUN: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 12) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
  FLAMER: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 20) DO SET_MOVE_TO_TARGET',
    'IF (DIST_TO_CLOSEST_BOT() <= 30 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO FLAMER ON',
    'IF (DIST_TO_CLOSEST_BOT() > 34 && SLOT_ACTIVE(SLOT1)) DO FLAMER OFF',
    'WAIT 1',
    'GOTO LOOP',
  ],
  PULSE: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 30) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 38 && SLOT_READY(SLOT1) && ENERGY >= 35) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ],
}

// Active opponent: hunts the closest bot and fires bullets back.
const HUNTER = {
  slotId: 'BOT2',
  loadout: ['BULLET', null, null],
  sourceText: [
    'LABEL LOOP',
    'TARGET_CLOSEST',
    'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 40) DO SET_MOVE_TO_TARGET',
    'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 2) DO USE_SLOT1 TARGET',
    'WAIT 1',
    'GOTO LOOP',
  ].join('\n') + '\n',
}

// Attacker programs for the active matchup. The CLOAK+SNIPER program uses
// SLOT1=CLOAK and SLOT2=SNIPER; it goes dark, then fires from the cloak window.
const ACTIVE_PROGRAMS = {
  BULLET: { loadout: ['BULLET', null, null], src: PROGRAMS.BULLET },
  SNIPER: { loadout: ['SNIPER', null, null], src: PROGRAMS.SNIPER },
  RAILGUN: { loadout: ['RAILGUN', null, null], src: PROGRAMS.RAILGUN },
  PULSE: { loadout: ['PULSE', 'BULLET', null], src: PROGRAMS.PULSE },
  'CLOAK+SNIPER': {
    loadout: ['CLOAK', 'SNIPER', null],
    src: [
      'LABEL LOOP',
      'TARGET_CLOSEST',
      'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET',
      'IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 120 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1) && ENERGY >= 30) DO USE_SLOT1 TARGET',
      'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 6) DO USE_SLOT2 TARGET',
      'WAIT 1',
      'GOTO LOOP',
    ],
  },
}

function runActive(name, seed) {
  const cfg = ACTIVE_PROGRAMS[name]
  const attacker = { slotId: 'BOT1', loadout: cfg.loadout, sourceText: cfg.src.join('\n') + '\n' }
  const replay = runMatchToReplay({ seed, tickCap: TICK_CAP, bots: [attacker, HUNTER] })
  const last = replay.state[replay.state.length - 1].bots
  const a = last.find((b) => b.botId === 'BOT1')
  const h = last.find((b) => b.botId === 'BOT2')
  let outcome = 'timeout'
  if (a.alive && !h.alive) outcome = 'win'
  else if (!a.alive && h.alive) outcome = 'loss'
  else if (!a.alive && !h.alive) outcome = 'mutual'
  return { outcome, hpLeft: a.hp, ticks: replay.state.length - 1 }
}

function attackerFor(mod) {
  return { slotId: 'BOT1', loadout: [mod, null, null], sourceText: PROGRAMS[mod].join('\n') + '\n' }
}

function runDuel(mod, seed) {
  const replay = runMatchToReplay({ seed, tickCap: TICK_CAP, bots: [attackerFor(mod), DUMMY] })
  let dmg = 0
  let killTick = null
  let firstHitTick = null
  replay.events.forEach((tickEvents, tick) => {
    for (const e of tickEvents || []) {
      if (!e) continue
      if (e.type === 'DAMAGE' && e.victimBotId === 'BOT2') {
        dmg += e.amount ?? 0
        if (firstHitTick === null) firstHitTick = tick
      }
      if (e.type === 'BOT_DIED' && e.victimBotId === 'BOT2' && killTick === null) killTick = tick
    }
  })
  return { dmg, killTick, firstHitTick }
}

const rows = []
for (const mod of Object.keys(PROGRAMS)) {
  let dmgSum = 0
  let kills = 0
  let killTickSum = 0
  let firstHitSum = 0
  let firstHitN = 0
  for (let s = 1; s <= SEEDS; s++) {
    const r = runDuel(mod, s)
    dmgSum += r.dmg
    if (r.killTick !== null) {
      kills++
      killTickSum += r.killTick
    }
    if (r.firstHitTick !== null) {
      firstHitSum += r.firstHitTick
      firstHitN++
    }
  }
  rows.push({
    module: mod,
    dmgPerMatch: (dmgSum / SEEDS).toFixed(1),
    killRate: (kills / SEEDS).toFixed(2),
    avgTicksToKill: kills ? (killTickSum / kills).toFixed(0) : '-',
    avgFirstHitTick: firstHitN ? (firstHitSum / firstHitN).toFixed(0) : '-',
  })
}

console.log(`Weapon duel vs passive dummy: ${SEEDS} seeds, tickCap=${TICK_CAP}`)
console.table(rows)

const activeRows = []
for (const name of Object.keys(ACTIVE_PROGRAMS)) {
  const c = { win: 0, loss: 0, mutual: 0, timeout: 0 }
  let hpSum = 0
  let tickSum = 0
  for (let s = 1; s <= SEEDS; s++) {
    const r = runActive(name, s)
    c[r.outcome]++
    hpSum += r.hpLeft
    tickSum += r.ticks
  }
  const f = (n) => (n / SEEDS).toFixed(2)
  activeRows.push({
    attacker: name,
    win: f(c.win),
    loss: f(c.loss),
    mutualKill: f(c.mutual),
    timeout: f(c.timeout),
    avgHpLeft: (hpSum / SEEDS).toFixed(0),
    avgTicks: (tickSum / SEEDS).toFixed(0),
  })
}
console.log(`Attacker vs active BULLET hunter: ${SEEDS} seeds, tickCap=${TICK_CAP}`)
console.table(activeRows)
