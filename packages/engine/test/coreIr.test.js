import test from 'node:test'
import assert from 'node:assert/strict'

import { compileBotSource } from '@coding-game/engine'

const ALLOWED_KINDS = new Set([
  // control flow
  'JUMP',
  'IF_JUMP',
  'IF_DO',
  'NOP',
  'WAIT',

  // timing
  'SET_TIMER',
  'CLEAR_TIMER',

  // canonical targeting
  'SET_TARGET_BOT',
  'SET_TARGET_POWERUP',
  'CLEAR_TARGET',

  // canonical movement
  'MOVE_DIR',
  'SET_MOVE',
  'MOVE',
  'CLEAR_MOVE',

  // modules
  'MODULE_TOGGLE',
  'USE_SLOT',
  'STOP_SLOT',

  // invalid placeholder
  'INVALID',
])

const LEGACY_KINDS = new Set([
  'GOTO',
  'IF_GOTO',
  'TARGET_CLOSEST',
  'TARGET_LOWEST_HEALTH',
  'TARGET_NEXT',
  'TARGET_NEXT_IF_DEAD',
  'TARGET_POWERUP',
  'SET_TARGET',
  'CLEAR_TARGET_BOT',
  'CLEAR_TARGET_POWERUP',
  'SET_MOVE_TO_TARGET',
  'SET_MOVE_TO_ZONE',
  'SET_MOVE_TO_SECTOR',
  'SET_MOVE_TO_POWERUP',
  'SET_MOVE_TO_BOT',
  'MOVE_TO_TARGET',
  'MOVE_TO_ZONE',
  'MOVE_TO_SECTOR',
  'MOVE_TO_BOT',
  'MOVE_TO_CLOSEST_BOT',
  'MOVE_TO_LOWEST_HEALTH_BOT',
  'MOVE_TO_POWERUP',
  'MOVE_TO_ARENA_EDGE',
])

test('compileBotSource emits a very small canonical core IR', () => {
  const src = [
    '; core IR smoke test',
    'LABEL LOOP',
    '',
    'TARGET_NEAREST',
    'IF (HEALTH < 10) DO TARGET_POWERUP HEALTH',
    'IF (HEALTH < 10) GOTO LOOP',
    'SET_TARGET BOT3',
    'CLEAR_TARGET_BOT',
    'SET_MOVE_TO_SECTOR 5 ZONE 2',
    'MOVE_TO_SECTOR 1',
    'MOVE UP_LEFT',
    'MOVE_TO_BOT NEAREST_BOT',
    'MOVE_TO_CLOSEST_BOT',
    'MOVE_TO_WALL LEFT',
    'CLEAR_MOVE',
    'FIRE_SLOT1 NEAREST_BOT',
  ].join('\n')

  const r = compileBotSource(src)
  assert.deepStrictEqual(r.errors, [])

  const instrs = r.program.instructions
  assert.ok(instrs.length > 0)

  // 1) Every instruction kind must be from the canonical set.
  for (const instr of instrs) {
    assert.ok(instr && typeof instr === 'object')
    assert.ok(ALLOWED_KINDS.has(instr.kind), `unexpected instruction kind: ${instr.kind}`)
    assert.ok(!LEGACY_KINDS.has(instr.kind), `legacy instruction kind leaked through: ${instr.kind}`)
  }

  // 2) Spot-check key normalizations.
  assert.ok(instrs.some((i) => i.kind === 'SET_TARGET_BOT' && i.selector === 'CLOSEST_BOT'))
  assert.ok(instrs.some((i) => i.kind === 'SET_TARGET_POWERUP' && i.type === 'HEALTH'))
  assert.ok(instrs.some((i) => i.kind === 'CLEAR_TARGET' && i.which === 'BOT'))

  // Control flow is numeric.
  assert.ok(instrs.some((i) => i.kind === 'JUMP' && Number.isInteger(i.targetPc)))
  assert.ok(instrs.some((i) => i.kind === 'IF_JUMP' && Number.isInteger(i.targetPc)))

  // Movement normalization.
  assert.ok(instrs.some((i) => i.kind === 'SET_MOVE' && i.target?.kind === 'SECTOR' && i.target?.sector === 5))
  assert.ok(instrs.some((i) => i.kind === 'MOVE_DIR' && i.dir === 'UP_LEFT'))
  assert.ok(instrs.some((i) => i.kind === 'MOVE' && i.target?.kind === 'BOT' && i.target?.token === 'CLOSEST_BOT'))
  assert.ok(instrs.some((i) => i.kind === 'MOVE' && i.target?.kind === 'ARENA_EDGE' && i.target?.dir === 'LEFT'))

  // Slot alias normalization.
  const useSlot = instrs.find((i) => i.kind === 'USE_SLOT' && i.slot === 1)
  assert.ok(useSlot, 'expected USE_SLOT slot=1')
  assert.equal(useSlot.target, 'CLOSEST_BOT')
})
