#!/usr/bin/env node
// Phase 9 balance harness: round-robin league of the example bots (bot0..bot9)
// across many seeds, reporting per-bot survival / wins / damage dealt.
// Used to sanity-check SNIPER / ROCKET / TELEPORT against legacy modules.
//
// Usage:
//   node scripts/balance-report.mjs                 # 10 seeds, tickCap 240
//   BALANCE_SEEDS=25 BALANCE_TICK_CAP=300 node scripts/balance-report.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// Import the engine directly from source so this script runs with plain
// `node` from anywhere (no bundler / pnpm workspace link required).
const { runMatchToReplay } = await import(
  pathToFileURL(path.join(repoRoot, 'packages/engine/src/index.js')).href
)

const SEED_COUNT = Number.parseInt(process.env.BALANCE_SEEDS || '10', 10)
const TICK_CAP = Number.parseInt(process.env.BALANCE_TICK_CAP || '240', 10)
const BOT_COUNT = Number.parseInt(process.env.BALANCE_BOTS || '10', 10)

function extractTextFence(md) {
  const m = md.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/)
  return m ? m[1] : ''
}

function parseLoadoutFromSourceHeader(sourceText) {
  const slots = [null, null, null]
  for (const line of sourceText.split(/\r?\n/)) {
    const m = line.match(/^;@(slot[123])\s+(\S+)/)
    if (m) {
      const idx = Number(m[1].slice(-1)) - 1
      slots[idx] = m[2] === 'EMPTY' ? null : m[2]
    }
  }
  return slots
}

function loadExampleBot(n) {
  const md = readFileSync(path.join(repoRoot, 'examples', `bot${n}.md`), 'utf8')
  const sourceText = extractTextFence(md)
  return { sourceText, loadout: parseLoadoutFromSourceHeader(sourceText) }
}

const bots = []
for (let i = 0; i < BOT_COUNT; i++) {
  bots.push({ id: `bot${i}`, ...loadExampleBot(i) })
}

const stats = new Map(
  bots.map((b) => [b.id, { survived: 0, wins: 0, games: 0, damageDealt: 0, damageTaken: 0, kills: 0 }])
)

const SLOTS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

// Group the 10 example bots into tables of 4 (last table has fewer).
const tables = []
for (let i = 0; i < bots.length; i += 4) {
  tables.push(bots.slice(i, i + 4))
}

for (const seed of Array.from({ length: SEED_COUNT }, (_, i) => i + 1)) {
  for (const table of tables) {
    const matchBots = table.map((b, i) => ({
      slotId: SLOTS[i],
      sourceText: b.sourceText,
      loadout: b.loadout,
    }))
    let replay
    try {
      replay = runMatchToReplay({ seed, tickCap: TICK_CAP, bots: matchBots })
    } catch (err) {
      console.error(`seed ${seed} table failed: ${err.message}`)
      continue
    }
    const final = replay.state[replay.state.length - 1]
    const alive = final.bots.filter((b) => b.alive)
    // Only slots actually occupied by this table count (engine always emits 4 entries).
    const bySlot = new Map(matchBots.map((mb, i) => [mb.slotId, table[i].id]))
    const tracked = (botId) => bySlot.has(botId) ? bySlot.get(botId) : null

    for (const b of final.bots) {
      const id = tracked(b.botId)
      if (!id) continue
      stats.get(id).games += 1
      if (b.alive) stats.get(id).survived += 1
    }
    if (alive.length === 1 && tracked(alive[0].botId)) {
      stats.get(tracked(alive[0].botId)).wins += 1
    }

    // Attribute damage/kills from events.
    for (const group of replay.events) {
      for (const e of group) {
        if (e.type === 'DAMAGE') {
          const srcId = e.sourceBotId ? tracked(e.sourceBotId) : null
          if (srcId) stats.get(srcId).damageDealt += e.amount ?? 0
          const victimId = e.victimBotId ? tracked(e.victimBotId) : null
          if (victimId) stats.get(victimId).damageTaken += e.amount ?? 0
        }
        if (e.type === 'BOT_DIED' && e.creditedBotId) {
          const killerId = tracked(e.creditedBotId)
          if (killerId) stats.get(killerId).kills += 1
        }
      }
    }
  }
}

const rows = [...stats.entries()].map(([id, s]) => ({
  bot: id,
  games: s.games,
  winRate: s.games ? (s.wins / s.games).toFixed(2) : '-',
  surviveRate: s.games ? (s.survived / s.games).toFixed(2) : '-',
  kills: s.kills,
  dmgOut: s.damageDealt,
  dmgIn: s.damageTaken,
  dmgPerGame: s.games ? (s.damageDealt / s.games).toFixed(1) : '-',
}))

rows.sort((a, b) => Number(b.winRate) - Number(a.winRate) || Number(b.dmgPerGame) - Number(a.dmgPerGame))

console.log(`Balance league: ${SEED_COUNT} seeds x ${tables.length} tables, tickCap=${TICK_CAP}`)
console.table(rows)
