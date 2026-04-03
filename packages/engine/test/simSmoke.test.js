import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileBotSource, runMatchToReplay } from '@coding-game/engine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')

/**
 * @param {string} md
 */
function extractTextFence(md) {
  const normalized = md.replace(/\r\n?/g, '\n')
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) throw new Error('No ```text code fence found')
  return m[1]
}

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

const KNOWN_MODULES = ['BULLET', 'SAW', 'SHIELD', 'ARMOR']

/**
 * @param {string} sourceText
 */
function deriveLoadoutFromHeader(sourceText) {
  const normalized = String(sourceText ?? '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')

  const loadout = /** @type {[any, any, any]} */ ([null, null, null])

  let commentLinesSeen = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (!trimmed.startsWith(';')) break

    commentLinesSeen++

    const m = trimmed.match(/^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i)
    if (m) {
      const slot = Number(m[1])
      const tok = String(m[2] ?? '').trim().toUpperCase()
      const mod = tok === 'EMPTY' || tok === 'NONE' ? null : KNOWN_MODULES.includes(tok) ? tok : null
      if (slot >= 1 && slot <= 3) loadout[slot - 1] = mod
    }

    if (commentLinesSeen >= 3) break
  }

  return loadout
}

function assertFiniteNumber(n, msg) {
  assert.ok(Number.isFinite(n), msg)
}

function assertFinitePos(pos, msg) {
  assertFiniteNumber(pos?.x, `${msg}: expected finite x`)
  assertFiniteNumber(pos?.y, `${msg}: expected finite y`)
}

test('runMatchToReplay: end-to-end example match replay is deterministic, ends, and has no NaNs', () => {
  const sources = [0, 4, 5, 6].map((n) => loadExampleBot(n))

  // Integration requirement: ensure example bots compile before sim.
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    assert.deepStrictEqual(compiled.errors ?? [], [], `expected bot${[0, 4, 5, 6][i]} to compile`)
  }

  const bots = [
    { slotId: 'BOT1', loadout: deriveLoadoutFromHeader(sources[0]), sourceText: sources[0] },
    { slotId: 'BOT2', loadout: deriveLoadoutFromHeader(sources[1]), sourceText: sources[1] },
    { slotId: 'BOT3', loadout: deriveLoadoutFromHeader(sources[2]), sourceText: sources[2] },
    { slotId: 'BOT4', loadout: deriveLoadoutFromHeader(sources[3]), sourceText: sources[3] },
  ]

  const params = { seed: 123, tickCap: 120, bots }

  const r1 = runMatchToReplay(params)
  const r2 = runMatchToReplay(params)

  assert.deepStrictEqual(r2, r1, 'expected deterministic replay output')

  assert.equal(r1.schemaVersion, '0.2.0')
  assert.equal(r1.rulesetVersion, '0.2.0')
  assert.equal(r1.matchSeed, 123)
  assert.ok(r1.tickCap <= 120)

  // state/events should be indexed by tick, including t=0.
  assert.equal(r1.state.length, r1.tickCap + 1)
  assert.equal(r1.events.length, r1.tickCap + 1)

  const endEvents = r1.events[r1.tickCap]
  assert.ok(endEvents.some((e) => e && e.type === 'MATCH_END'), 'expected MATCH_END on final tick')

  const allEvents = r1.events.flat()
  assert.ok(allEvents.some((e) => e && e.type === 'BULLET_SPAWN'), 'expected at least one BULLET_SPAWN')
  assert.ok(allEvents.some((e) => e && e.type === 'DAMAGE' && e.amount > 0), 'expected at least one DAMAGE event')

  // No NaNs / non-finite numeric values in replay state.
  for (const s of r1.state) {
    for (const b of s.bots) {
      assertFiniteNumber(b.pos.x, `expected finite bot.pos.x at t=${s.t} (${b.botId})`)
      assertFiniteNumber(b.pos.y, `expected finite bot.pos.y at t=${s.t} (${b.botId})`)
      assertFiniteNumber(b.hp, `expected finite bot.hp at t=${s.t} (${b.botId})`)
      assertFiniteNumber(b.ammo, `expected finite bot.ammo at t=${s.t} (${b.botId})`)
      assertFiniteNumber(b.energy, `expected finite bot.energy at t=${s.t} (${b.botId})`)
      assertFiniteNumber(b.pc, `expected finite bot.pc at t=${s.t} (${b.botId})`)
    }

    for (const bl of s.bullets) {
      assertFiniteNumber(bl.pos.x, `expected finite bullet.pos.x at t=${s.t} (${bl.bulletId})`)
      assertFiniteNumber(bl.pos.y, `expected finite bullet.pos.y at t=${s.t} (${bl.bulletId})`)
      assertFiniteNumber(bl.vel.x, `expected finite bullet.vel.x at t=${s.t} (${bl.bulletId})`)
      assertFiniteNumber(bl.vel.y, `expected finite bullet.vel.y at t=${s.t} (${bl.bulletId})`)
    }
  }

  for (const event of allEvents) {
    if (!event) continue

    if (event.type === 'BULLET_SPAWN') {
      assertFinitePos(event.pos, `expected finite BULLET_SPAWN.pos for ${event.bulletId}`)
      assertFinitePos(event.vel, `expected finite BULLET_SPAWN.vel for ${event.bulletId}`)
    }

    if (event.type === 'BULLET_MOVE') {
      assertFinitePos(event.fromPos, `expected finite BULLET_MOVE.fromPos for ${event.bulletId}`)
      assertFinitePos(event.toPos, `expected finite BULLET_MOVE.toPos for ${event.bulletId}`)
    }

    if (event.type === 'BULLET_HIT') {
      assertFinitePos(event.hitPos, `expected finite BULLET_HIT.hitPos for ${event.bulletId}`)
      assertFiniteNumber(event.damage, `expected finite BULLET_HIT.damage for ${event.bulletId}`)
    }

    if (event.type === 'BULLET_DESPAWN') {
      assertFinitePos(event.pos, `expected finite BULLET_DESPAWN.pos for ${event.bulletId}`)
    }
  }
})
