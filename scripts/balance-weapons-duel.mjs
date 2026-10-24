// Weapon duel harness (ruleset 0.3.0 balance).
//
// Each attacker runs a minimal, weapon-appropriate program against a passive
// dummy (no loadout, WAIT loop). Isolating one weapon per run removes table-mate
// noise from scripts/balance-report.mjs, so per-module damage and time-to-kill
// can be compared directly.
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
