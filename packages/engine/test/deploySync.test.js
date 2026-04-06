import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDeployFiles, listDeploySyncTargets } from '../../../scripts/deploySync.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '../../..')

test('deploy-time copies are in sync with authoritative sources', async () => {
  await checkDeployFiles(repoRoot)
})

test('deploy sync target list covers mirrored replay, ruleset, and engine artifacts', async () => {
  const targets = await listDeploySyncTargets(repoRoot)
  const dests = new Set(targets.map((t) => t.dest))

  assert.ok(dests.has('deploy/bot-instructions.md'))
  assert.ok(dests.has('deploy/workshop/exampleBots.js'))
  assert.ok(dests.has('deploy/replay/index.js'))
  assert.ok(dests.has('deploy/replay/index.d.ts'))
  assert.ok(dests.has('deploy/replay/generateSampleReplay.js'))
  assert.ok(dests.has('deploy/ruleset/index.js'))
  assert.ok(dests.has('deploy/ruleset/index.d.ts'))
  assert.ok(dests.has('deploy/engine/src/index.js'))
  assert.ok(dests.has('deploy/engine/src/sim/runMatchToReplay.js'))
})
