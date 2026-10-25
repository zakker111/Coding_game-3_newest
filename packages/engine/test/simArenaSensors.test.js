import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { compileBotProgram } from '../src/dsl/compileBotProgram.js'

// Walls, corners, and sector sensors used inside IF ... DO, driven by a live match.
const SENSOR_SRC = [
  'LABEL L',
  'IF (DIST_TO_WALL() < 5) DO MOVE RIGHT',
  'IF (MY_SECTOR() == 1 && ENEMY_COUNT() > 0) DO MOVE UP',
  'MOVE LEFT',
  'GOTO L',
  '',
].join('\n')

function bots() {
  return [
    { slotId: 'BOT1', sourceText: SENSOR_SRC },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]
}

test('arena sensors: DIST_TO_WALL(), MY_SECTOR(), ENEMY_COUNT() compile inside IF', () => {
  assert.deepStrictEqual(compileBotProgram(SENSOR_SRC).errors, [])
})

test('arena sensors: sensor-driven bot runs with no invalid instructions and reacts at walls', () => {
  const replay = runMatchToReplay({ seed: 7, tickCap: 60, bots: bots() })
  const b1 = replay.events.flat().filter((e) => e && e.botId === 'BOT1')

  assert.equal(
    b1.filter((e) => e.type === 'BOT_EXEC' && e.instrText === 'INVALID').length,
    0,
    'no INVALID instructions'
  )
  // Moving LEFT into the left wall triggers the DIST_TO_WALL() < 5 branch.
  assert.ok(
    b1.some((e) => e.type === 'BOT_EXEC' && e.instrText === 'IF_DO' && e.result === 'EXECUTED'),
    'expected at least one IF_DO branch to execute'
  )
})

test('arena sensors: sensor-driven match is deterministic for the same seed', () => {
  const params = { seed: 7, tickCap: 60, bots: bots() }
  assert.deepStrictEqual(runMatchToReplay(params), runMatchToReplay(params))
})

test('arena sensors: sector border positions map to the expected MY_SECTOR()', async () => {
  const { sectorFromPos } = await import('../src/sim/arenaMath.js')
  // SECTOR_SIZE_WORLD is 64: sector 1 = x,y in [0,64); sector 2 starts at x=64.
  assert.equal(sectorFromPos({ x: 0, y: 0 }), 1)
  assert.equal(sectorFromPos({ x: 63, y: 63 }), 1)
  assert.equal(sectorFromPos({ x: 64, y: 0 }), 2)
  assert.equal(sectorFromPos({ x: 0, y: 64 }), 4)
  assert.equal(sectorFromPos({ x: 191, y: 191 }), 9)
})
