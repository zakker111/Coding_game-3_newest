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

function loadExampleBotSource(name) {
  const filename = path.join(repoRoot, 'examples', `${name}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function bulletSpawnEvents(replay) {
  return replay.events.flat().filter((e) => e && e.type === 'BULLET_SPAWN')
}

test('runMatchToReplay: explicit loadout controls BULLET spawns; omitted loadout defaults to empty', () => {
  const src = loadExampleBotSource('bot0')

  const compiled = compileBotSource(src)
  assert.deepStrictEqual(compiled.errors ?? [], [], 'expected bot0 to compile')

  const bulletParams = {
    seed: 7,
    tickCap: 120,
    bots: [
      { slotId: 'BOT1', sourceText: src, loadout: ['BULLET', null, null] },
      { slotId: 'BOT2', sourceText: src, loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: src, loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: src, loadout: [null, null, null] },
    ],
  }

  const rBullet = runMatchToReplay(bulletParams)
  assert.equal(rBullet.rulesetVersion, '0.2.0')

  const bulletEvents = bulletSpawnEvents(rBullet)
  assert.ok(bulletEvents.length > 0, 'expected at least one BULLET_SPAWN when BULLET is equipped')
  assert.ok(
    bulletEvents.every((e) => e.ownerBotId === 'BOT1'),
    'expected only BOT1 to spawn bullets when only BOT1 has BULLET equipped'
  )

  const emptyParams = {
    seed: 7,
    tickCap: 120,
    bots: [
      { slotId: 'BOT1', sourceText: src, loadout: [null, null, null] },
      { slotId: 'BOT2', sourceText: src, loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: src, loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: src, loadout: [null, null, null] },
    ],
  }

  const rEmpty = runMatchToReplay(emptyParams)
  assert.equal(rEmpty.rulesetVersion, '0.2.0')
  assert.equal(bulletSpawnEvents(rEmpty).length, 0, 'expected no BULLET_SPAWN when loadout is empty')

  const omittedParams = {
    seed: 7,
    tickCap: 120,
    bots: [
      { slotId: 'BOT1', sourceText: src },
      { slotId: 'BOT2', sourceText: src },
      { slotId: 'BOT3', sourceText: src },
      { slotId: 'BOT4', sourceText: src },
    ],
  }

  const rOmitted = runMatchToReplay(omittedParams)
  assert.equal(rOmitted.rulesetVersion, '0.2.0')

  for (const b of rOmitted.bots) {
    assert.deepStrictEqual(b.loadout, [null, null, null], `expected default-empty loadout for ${b.slotId}`)
  }

  assert.equal(bulletSpawnEvents(rOmitted).length, 0, 'expected no BULLET_SPAWN when loadout is omitted (default-empty)')
})
