import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileBotSource, runMatchToReplay } from '../../src/index.js'

import { stableStringify } from '../_util/stableStringify.js'
import { extractTextFence, buildMatchBotsFromSources, hashReplayCore, hashTicks } from './goldenHarnessUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../..')

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function stablePrettyJson(obj) {
  // Ensure stable key ordering across runs/Node versions.
  return JSON.stringify(JSON.parse(stableStringify(obj)), null, 2)
}

function writeFixture(name, obj) {
  const outPath = path.join(__dirname, 'fixtures', `${name}.json`)
  writeFileSync(outPath, `${stablePrettyJson(obj)}\n`)
  process.stdout.write(`wrote ${path.relative(repoRoot, outPath)}\n`)
}

function buildScenario({ name, seed, tickCap, botNums }) {
  if (!Array.isArray(botNums) || botNums.length !== 4) {
    throw new Error(`expected botNums to be an array of 4 bot indices; got: ${JSON.stringify(botNums)}`)
  }

  const sources = botNums.map((n) => loadExampleBot(n))

  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    if ((compiled.errors ?? []).length) {
      throw new Error(`expected bot${botNums[i]} to compile; got errors: ${JSON.stringify(compiled.errors)}`)
    }
  }

  const bots = buildMatchBotsFromSources(sources)
  const replay = runMatchToReplay({ seed, tickCap, bots })

  const expectedLen = replay.tickCap + 1
  if (replay.state.length !== expectedLen) throw new Error(`expected replay.state length ${expectedLen}, got ${replay.state.length}`)
  if (replay.events.length !== expectedLen) throw new Error(`expected replay.events length ${expectedLen}, got ${replay.events.length}`)

  return {
    name,
    params: { seed, tickCap: replay.tickCap, bots: [...botNums] },
    coreReplaySha256: hashReplayCore(replay),
    stateTickSha256: hashTicks(replay.state),
    eventsTickSha256: hashTicks(replay.events),
  }
}

writeFixture(
  'examples_smoke_seed123',
  buildScenario({ name: 'examples_smoke_seed123', seed: 123, tickCap: 50, botNums: [0, 1, 2, 3] })
)

writeFixture(
  'examples_patrol_seed456',
  buildScenario({ name: 'examples_patrol_seed456', seed: 456, tickCap: 80, botNums: [1, 2, 3, 0] })
)

writeFixture(
  'modules_powerups_seed999',
  buildScenario({ name: 'modules_powerups_seed999', seed: 999, tickCap: 120, botNums: [0, 5, 6, 4] })
)

writeFixture(
  'modules_saw_rush_seed777',
  buildScenario({ name: 'modules_saw_rush_seed777', seed: 777, tickCap: 90, botNums: [4, 6, 5, 0] })
)
