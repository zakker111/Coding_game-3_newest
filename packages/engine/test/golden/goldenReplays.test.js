import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileBotSource, runMatchToReplay } from '../../src/index.js'

import { extractTextFence, buildMatchBotsFromSources, hashReplayCore, hashTicks } from './goldenHarnessUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../..')

const placeholderSha = '__REPLACE_BY_RUNNING_pnpm_golden_update__'

function envFlag(name) {
  const raw = process.env[name]
  if (!raw) return false
  const v = String(raw).trim().toLowerCase()
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no'
}

const strict = envFlag('GOLDEN_STRICT')

function skipOrFail(t, msg) {
  if (strict) assert.fail(msg)
  t.skip(msg)
}

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function assertTickHashesEqual(kind, got, expected) {
  if (!Array.isArray(expected)) {
    assert.fail(`${kind} fixture is missing an array of per-tick hashes (run \`pnpm golden:update\`)`)
  }

  if (got.length !== expected.length) {
    assert.fail(`${kind} hash length mismatch: got ${got.length}, expected ${expected.length}`)
  }

  for (let i = 0; i < got.length; i++) {
    if (got[i] !== expected[i]) {
      assert.fail(`${kind} first diverged at tick t=${i}: got ${got[i]}, expected ${expected[i]}`)
    }
  }
}

function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`)
  if (!existsSync(fixturePath)) return null
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

function runScenarioExampleBots({ seed, tickCap, botNums }) {
  const sources = botNums.map((n) => loadExampleBot(n))
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    assert.deepStrictEqual(compiled.errors ?? [], [], `expected bot${botNums[i]} to compile`)
  }

  const bots = buildMatchBotsFromSources(sources)

  const replay = runMatchToReplay({ seed, tickCap, bots })

  return {
    coreReplaySha256: hashReplayCore(replay),
    stateTickSha256: hashTicks(replay.state),
    eventsTickSha256: hashTicks(replay.events),
  }
}

const scenarios = [
  { fixtureName: 'examples_smoke_seed123', seed: 123, botNums: [0, 1, 2, 3] },
  { fixtureName: 'examples_patrol_seed456', seed: 456, botNums: [1, 2, 3, 0] },
  { fixtureName: 'modules_powerups_seed999', seed: 999, botNums: [0, 5, 6, 4] },
  { fixtureName: 'modules_saw_rush_seed777', seed: 777, botNums: [4, 6, 5, 0] },
]

for (const { fixtureName, seed, botNums } of scenarios) {
  test(`golden: ${fixtureName}`, (t) => {
    const fixture = loadFixture(fixtureName)
    if (!fixture) {
      skipOrFail(t, `golden fixture missing: ${fixtureName}.json`)
      return
    }

    if (fixture.coreReplaySha256 === placeholderSha) {
      skipOrFail(t, 'golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
      return
    }

    assert.equal(fixture.name, fixtureName)
    assert.equal(fixture.params?.seed, seed)
    assert.deepStrictEqual(fixture.params?.bots, botNums)

    assert.ok(Number.isInteger(fixture.params?.tickCap) && fixture.params.tickCap > 0, 'fixture.params.tickCap must be an integer > 0')

    assert.ok(Array.isArray(fixture.stateTickSha256), 'fixture.stateTickSha256 must be an array')
    assert.ok(Array.isArray(fixture.eventsTickSha256), 'fixture.eventsTickSha256 must be an array')
    assert.ok(fixture.stateTickSha256.length > 0, 'fixture.stateTickSha256 must be non-empty')
    assert.ok(fixture.eventsTickSha256.length > 0, 'fixture.eventsTickSha256 must be non-empty')

    const got = runScenarioExampleBots({
      seed: fixture.params.seed,
      tickCap: fixture.params.tickCap,
      botNums: fixture.params.bots,
    })

    assert.equal(got.coreReplaySha256, fixture.coreReplaySha256)
    assertTickHashesEqual('state', got.stateTickSha256, fixture.stateTickSha256)
    assertTickHashesEqual('events', got.eventsTickSha256, fixture.eventsTickSha256)
  })
}
  
