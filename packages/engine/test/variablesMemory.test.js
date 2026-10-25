import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { compileBotProgram } from '../src/dsl/compileBotProgram.js'
import { initBotVm, stepBotVm } from '../src/vm/botVm.js'

// 10.2: V1..V4 registers and event memory (LAST_HIT_*, TICKS_SINCE_HIT).

const FLEE_SRC = [
  ';@slot1 EMPTY',
  'SET_MOVE_TO_SECTOR 5',
  'LABEL WATCH',
  'IF (TICKS_SINCE_HIT() <= 4) DO ADD_V1 1',
  'IF (V1 >= 2 && TICKS_SINCE_HIT() <= 10) GOTO FLEE',
  'IF (TICKS_SINCE_HIT() > 10) DO SET_V1 0',
  'GOTO WATCH',
  'LABEL FLEE',
  'SET_MOVE_TO_SECTOR 1',
  'GOTO FLEE',
  '',
].join('\n')

const SHOOTER_SRC = [';@slot1 BULLET', 'LABEL L', 'TARGET_LOWEST_HEALTH', 'IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET', 'GOTO L', ''].join('\n')

function matchBots(botSrc) {
  return [
    { slotId: 'BOT1', sourceText: botSrc },
    { slotId: 'BOT2', sourceText: SHOOTER_SRC, loadout: ['BULLET', null, null] },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]
}

function hitTicksOf(replay, victim) {
  const out = []
  replay.events.forEach((ev, t) => {
    for (const e of ev) if (e.type === 'DAMAGE' && e.victimBotId === victim && e.amount > 0) out.push(t)
  })
  return out
}

test('compile: V1..V4 registers accept SET_V<n> and ADD_V<n>, and read in conditions', () => {
  const src = ['SET_V1 3', 'ADD_V2 4', 'IF (V1 > 2 && V4 == 0) DO SET_V3 9', ''].join('\n')
  const { errors, program } = compileBotProgram(src)
  assert.deepStrictEqual(errors, [])
  assert.equal(program.instructions[0].kind, 'SET_REG')
  assert.equal(program.instructions[0].register, 'V1')
  assert.equal(program.instructions[0].value, 3)
  assert.equal(program.instructions[1].kind, 'ADD_REG')
  assert.equal(program.instructions[1].register, 'V2')
  assert.equal(program.instructions[1].delta, 4)
})

test('compile: SET_V5 is rejected (only V1..V4 exist)', () => {
  const { errors } = compileBotProgram('SET_V5 1\n')
  assert.ok(errors.length > 0)
})

test('VM: V registers start at 0 and are isolated from R registers', () => {
  let vm = initBotVm(compileBotProgram(['SET_V1 7', 'SET R1 2', ''].join('\n')).program)
  const obs = {}
  vm = stepBotVm(vm, obs).vm
  vm = stepBotVm(vm, obs).vm
  assert.equal(vm.vars.V1, 7)
  assert.equal(vm.vars.R1, 2)
  assert.equal(vm.vars.V2, 0)
})

test('VM: ADD_V clamps to 0..999', () => {
  let vm = initBotVm(compileBotProgram(['SET_V1 998', 'ADD_V1 50', ''].join('\n')).program)
  vm = stepBotVm(vm, {}).vm
  vm = stepBotVm(vm, {}).vm
  assert.equal(vm.vars.V1, 999)
})

test('match: V registers reset at match start and appear in replay state', () => {
  const replay = runMatchToReplay({ seed: 3, tickCap: 5, bots: matchBots('SET_V1 5\nWAIT 1\n') })
  const first = replay.state[0].bots[0].registers
  assert.deepStrictEqual(first, { R1: 0, R2: 0, R3: 0, R4: 0, V1: 0, V2: 0, V3: 0, V4: 0 })
  const later = replay.state.at(-1).bots[0].registers
  assert.equal(later.V1, 5)
})

test('match: LAST_HIT_* and TICKS_SINCE_HIT() reflect the last hit', () => {
  const src = [
    ';@slot1 EMPTY',
    'LABEL L',
    'IF (TICKS_SINCE_HIT() <= 10 && LAST_HIT_BY() == 2) DO SET_V2 1',
    'IF (LAST_HIT_TICK() > 0) DO SET_V3 1',
    'GOTO L',
    '',
  ].join('\n')
  const replay = runMatchToReplay({ seed: 1, tickCap: 40, bots: matchBots(src) })
  const hits = hitTicksOf(replay, 'BOT1')
  assert.ok(hits.length > 0, 'BOT1 was hit')
  const after = replay.state.at(-1).bots[0].registers
  assert.equal(after.V2, 1, 'hit by BOT2 is recorded in LAST_HIT_BY')
  assert.equal(after.V3, 1, 'LAST_HIT_TICK is set after a hit')
})

test('match: TICKS_SINCE_HIT() is 999 and LAST_HIT_BY() is 0 before any hit', () => {
  const src = ['IF (TICKS_SINCE_HIT() == 999 && LAST_HIT_BY() == 0 && LAST_HIT_SECTOR() == 0) DO SET_V4 1', 'WAIT 1', ''].join('\n')
  const replay = runMatchToReplay({ seed: 1, tickCap: 3, bots: [
    { slotId: 'BOT1', sourceText: src },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ] })
  assert.equal(replay.state.at(-1).bots[0].registers.V4, 1)
})

test('acceptance: bot hit twice within 10 ticks flees to sector 1', () => {
  let found = null
  for (const seed of [1, 2, 3, 7, 11]) {
    const replay = runMatchToReplay({ seed, tickCap: 80, bots: matchBots(FLEE_SRC) })
    const hits = hitTicksOf(replay, 'BOT1')
    const twoWithin10 = hits.some((t, i) => i > 0 && t - hits[i - 1] <= 10)
    if (!twoWithin10) continue
    const sectorAt = (s) => {
      const p = s.bots[0].pos
      return Math.floor(p.y / 64) * 3 + Math.floor(p.x / 64) + 1
    }
    const idx = hits.findIndex((t, i) => i > 0 && t - hits[i - 1] <= 10)
    found = { seed, sectorAfterSecondHit: sectorAt(replay.state[hits[idx] + 1]), finalSector: sectorAt(replay.state.at(-1)), invalid: replay.events.flat().filter((e) => e.type === 'BOT_EXEC' && e.instrText === 'INVALID').length }
    break
  }
  assert.ok(found, 'some seed produces two hits within 10 ticks')
  assert.equal(found.finalSector, 1, 'bot ends in its safe sector 1')
  assert.equal(found.invalid, 0)
})

test('VM: at most one register write per tick (two writes take two ticks)', () => {
  let vm = initBotVm(compileBotProgram(['SET_V1 1', 'SET_V2 2', ''].join('\n')).program)
  vm = stepBotVm(vm, {}).vm
  assert.equal(vm.vars.V1, 1)
  assert.equal(vm.vars.V2, 0, 'second write waits for the next tick')
  vm = stepBotVm(vm, {}).vm
  assert.equal(vm.vars.V2, 2)
})
