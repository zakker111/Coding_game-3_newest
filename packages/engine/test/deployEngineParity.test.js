import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runMatchToReplay as runAuthoritative } from '@coding-game/engine'

import { hashReplayCore } from './golden/goldenHarnessUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const deployEngineEntryUrl = pathToFileURL(path.join(repoRoot, 'deploy', 'engine', 'src', 'index.js')).href

const { runMatchToReplay: runDeploy } = await import(deployEngineEntryUrl)

function compareParity(buildParams) {
  const authoritativeReplay = runAuthoritative(buildParams())
  const deployReplay = runDeploy(buildParams())

  assert.equal(
    hashReplayCore(deployReplay),
    hashReplayCore(authoritativeReplay),
    'expected deploy engine replay core to match authoritative engine output',
  )

  return { authoritativeReplay, deployReplay }
}

test('deploy engine parity: idle baseline replay core matches authoritative engine', () => {
  compareParity(() => ({
    seed: 7,
    tickCap: 12,
    bots: [
      { slotId: 'BOT1', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }))
})

test('deploy engine parity: loadout normalization replay core matches authoritative engine', () => {
  const { authoritativeReplay } = compareParity(() => ({
    seed: 1,
    tickCap: 0,
    bots: [
      { slotId: 'BOT1', sourceText: 'WAIT 1\n', loadout: ['BULLET', 'LASER', 'ARMOR'] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }))

  const bot1 = authoritativeReplay.bots.find((bot) => bot.slotId === 'BOT1')
  assert.ok(bot1)
  assert.deepStrictEqual(bot1.loadoutIssues, [{ kind: 'UNKNOWN_MODULE', slot: 2, module: 'LASER' }])
})

test('deploy engine parity: bullet-target replay core matches authoritative engine', () => {
  const { authoritativeReplay } = compareParity(() => ({
    seed: 123,
    tickCap: 10,
    bots: [
      {
        slotId: 'BOT1',
        sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY

LABEL LOOP
  SET_TARGET BOT2
  USE_SLOT1 TARGET
  WAIT 1
  GOTO LOOP
`,
        loadout: ['BULLET', null, null],
      },
      {
        slotId: 'BOT2',
        sourceText: `;@slot1 EMPTY
;@slot2 ARMOR
;@slot3 EMPTY

LABEL LOOP
  TARGET_CLOSEST_BULLET
  MOVE_AWAY_FROM_TARGET
  GOTO LOOP
`,
        loadout: [null, 'ARMOR', null],
      },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }))

  const anyBot2TargetBullet = authoritativeReplay.state.some((tick) =>
    tick.bots.some((bot) => bot.botId === 'BOT2' && typeof bot.targetBulletId === 'string' && bot.targetBulletId.length > 0),
  )

  assert.equal(anyBot2TargetBullet, true)
})
