import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initBotVm, stepBotVm } from '../src/vm/botVm.js'
import { parseExpression } from '../src/dsl/expr.js'
import { compileBotSource } from '@coding-game/engine'

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

test('botVm: pc increments and wraps (len=2)', () => {
  const program = { instructions: [{ kind: 'NOP' }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 1)
})

test('botVm: JUMP sets pc to targetPc', () => {
  const program = {
    instructions: [{ kind: 'JUMP', targetPc: 2 }, { kind: 'NOP' }],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})

  assert.equal(r.debug.executedKind, 'JUMP')
  assert.equal(r.vm.pc, 2)
})

test('botVm: WAIT 2 blocks the next 2 ticks and advances pc when the wait completes', () => {
  const program = { instructions: [{ kind: 'WAIT', ticks: 2 }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  // Execute WAIT.
  let r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(vm.waitRemaining, 2)
  assert.equal(vm.pc, 1)
  assert.equal(r.debug.waiting, false)
  assert.equal(r.debug.executedKind, 'WAIT')

  // Tick 1 waiting.
  r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.debug.waiting, true)
  assert.equal(r.debug.executedKind, null)
  assert.equal(vm.pc, 1)
  assert.equal(vm.waitRemaining, 1)

  // Tick 2 waiting: counter reaches 0, pc advances once.
  r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.debug.waiting, true)
  assert.equal(vm.waitRemaining, 0)
  assert.equal(vm.pc, 2)

  // Next tick executes NOP.
  r = stepBotVm(vm, {})
  assert.equal(r.debug.waiting, false)
  assert.equal(r.debug.executedKind, 'NOP')
  assert.equal(r.vm.pc, 1)
})

test('botVm: SET_TIMER decrements at start-of-step', () => {
  const program = { instructions: [{ kind: 'SET_TIMER', timer: 1, ticks: 3 }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 3)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 2)
})

test('botVm: timers decrement and TIMER_DONE(T1) is observable next tick (IF_DO + PING())', () => {
  let pings = 0

  const program = {
    instructions: [
      { kind: 'SET_TIMER', timer: 1, ticks: 1 },
      {
        kind: 'IF_DO',
        expr: parseExpression('TIMER_DONE(T1) && PING()'),
        instruction: { kind: 'NOP' },
      },
    ],
  }

  let vm = initBotVm(program)

  // Step 1: set timer to 1.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)
  assert.equal(vm.timers[1], 1)

  // Step 2: timer decrements to 0 at start-of-step; IF_DO sees TIMER_DONE(T1).
  ;({ vm } = stepBotVm(vm, {
    functions: {
      PING() {
        pings++
        return 1
      },
    },
  }))

  assert.equal(vm.timers[1], 0)
  assert.equal(pings, 1)
})

test('botVm: IF_DO executes nested instruction when condition true (TIMER_ACTIVE)', () => {
  const program = {
    instructions: [
      { kind: 'SET_TIMER', timer: 1, ticks: 2 },
      {
        kind: 'IF_DO',
        expr: parseExpression('TIMER_ACTIVE(T1)'),
        instruction: { kind: 'MOVE_DIR', dir: 'UP' },
      },
      { kind: 'NOP' },
    ],
  }

  let vm = initBotVm(program)

  // Step 1: set timer.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)
  assert.equal(vm.timers[1], 2)

  // Step 2: timer decrements to 1, IF_DO true, emits MOVE_DIR.
  const r = stepBotVm(vm, {})
  assert.equal(r.vm.timers[1], 1)
  assert.deepStrictEqual(r.effects, [{ kind: 'MOVE_DIR', dir: 'UP' }])
  assert.equal(r.vm.pc, 3)
})

test('botVm: IF_JUMP short-circuit (HEALTH < 10 || UNKNOWN()) does not call UNKNOWN()', () => {
  let calls = 0

  const program = {
    instructions: [
      {
        kind: 'IF_JUMP',
        expr: parseExpression('HEALTH < 10 || UNKNOWN()'),
        targetPc: 2,
      },
      { kind: 'NOP' },
    ],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {
    vars: { HEALTH: 5 },
    functions: {
      UNKNOWN() {
        calls++
        return 1
      },
    },
  })

  assert.equal(r.vm.pc, 2)
  assert.equal(calls, 0)
})

test('botVm: IF_JUMP true jumps to targetPc', () => {
  const program = {
    instructions: [
      { kind: 'IF_JUMP', expr: parseExpression('1 == 1'), targetPc: 2 },
      { kind: 'NOP' },
    ],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})
  assert.equal(r.debug.executedKind, 'IF_JUMP')
  assert.equal(r.vm.pc, 2)
})

test('botVm: INVALID instruction resets pc to 1 (NOP + pc reset)', () => {
  const program = {
    instructions: [{ kind: 'INVALID' }, { kind: 'NOP' }],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})

  assert.equal(r.debug.executedKind, 'INVALID')
  assert.equal(r.vm.pc, 1)
})

test('botVm: unknown instruction kind is treated as INVALID and resets pc to 1', () => {
  const program = {
    instructions: [{ kind: 'MADE_UP_OP' }, { kind: 'NOP' }],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})

  assert.equal(r.debug.executedKind, 'INVALID')
  assert.equal(r.vm.pc, 1)
})

test('botVm: IF_DO does not execute nested control-flow (nested WAIT is ignored)', () => {
  const program = {
    instructions: [
      {
        kind: 'IF_DO',
        expr: parseExpression('1 == 1'),
        instruction: { kind: 'WAIT', ticks: 2 },
      },
      { kind: 'NOP' },
    ],
  }

  let vm = initBotVm(program)

  // Tick 1: IF_DO executes, but nested WAIT is disallowed => no wait.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.waitRemaining, 0)
  assert.equal(vm.pc, 2)

  // Tick 2: NOP executes.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 1)
})

test('botVm: timers continue decrementing during WAIT stalls', () => {
  const program = {
    instructions: [
      { kind: 'SET_TIMER', timer: 1, ticks: 2 },
      { kind: 'WAIT', ticks: 2 },
      { kind: 'NOP' },
    ],
  }

  let vm = initBotVm(program)

  // Tick 1: set timer to 2.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 2)
  assert.equal(vm.pc, 2)

  // Tick 2: timer decrements to 1, execute WAIT(2) sets waitRemaining.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 1)
  assert.equal(vm.waitRemaining, 2)
  assert.equal(vm.pc, 2)

  // Tick 3: waiting, timer decrements to 0.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 0)
  assert.equal(vm.waitRemaining, 1)
  assert.equal(vm.pc, 2)

  // Tick 4: waiting completes, pc advances to the next instruction.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 0)
  assert.equal(vm.waitRemaining, 0)
  assert.equal(vm.pc, 3)
})

test('botVm: bot/powerup targets are independent registers', () => {
  const program = {
    instructions: [
      { kind: 'SET_TARGET_POWERUP', type: 'HEALTH' },
      { kind: 'SET_TARGET_BOT', selector: 'CLOSEST_BOT' },
      { kind: 'CLEAR_TARGET', which: 'BOT' },
      { kind: 'SET_TARGET_BOT', selector: 'LOWEST_HEALTH_BOT' },
      { kind: 'CLEAR_TARGET', which: 'POWERUP' },
    ],
  }

  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.target.powerupType, 'HEALTH')
  assert.equal(vm.target.botSelector, null)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.target.powerupType, 'HEALTH')
  assert.equal(vm.target.botSelector, 'CLOSEST_BOT')

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.target.powerupType, 'HEALTH')
  assert.equal(vm.target.botSelector, null)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.target.powerupType, 'HEALTH')
  assert.equal(vm.target.botSelector, 'LOWEST_HEALTH_BOT')

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.target.powerupType, null)
  assert.equal(vm.target.botSelector, 'LOWEST_HEALTH_BOT')
})

test('botVm: register instructions clamp and are visible to expressions', () => {
  const program = {
    instructions: [
      { kind: 'SET_REG', register: 'R1', value: 998 },
      { kind: 'ADD_REG', register: 'R1', delta: 5 },
      { kind: 'ADD_REG', register: 'R1', delta: -999 },
      {
        kind: 'IF_DO',
        expr: parseExpression('R1 == 0'),
        instruction: { kind: 'SET_REG', register: 'R2', value: 7 },
      },
    ],
  }

  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.vars.R1, 998)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.vars.R1, 999)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.vars.R1, 0)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.vars.R2, 7)
})

test('botVm: integration smoke - compile bot0 and step 10 ticks without crashing', () => {
  const filename = path.join(repoRoot, 'examples', 'bot0.md')
  const md = readFileSync(filename, 'utf8')
  const sourceText = extractTextFence(md)

  const compiled = compileBotSource(sourceText)
  assert.deepStrictEqual(compiled.errors, [])

  const program = compiled.program
  assert.ok(program.instructions.length > 0)

  let vm = initBotVm(program)

  // Minimal observation surface to allow expressions in bot0 to evaluate.
  const observation = {
    vars: { HEALTH: 100, AMMO: 50, ENERGY: 100 },
    powerups: new Set(['HEALTH', 'AMMO', 'ENERGY']),
    slotReady(slot) {
      return slot === 1
    },
    slotActive() {
      return false
    },
    distToClosestBot: 10,
    zone: 1,
    botsAlive: { BOT1: true, BOT2: true, BOT3: true, BOT4: true },
    bumpedBot: false,
  }

  for (let i = 0; i < 10; i++) {
    const r = stepBotVm(vm, observation)
    vm = r.vm
    assert.ok(vm.pc >= 1 && vm.pc <= program.instructions.length)
  }
})
