import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/**
 * @param {any} r
 */
function getExecutableInstructions(r) {
  if (Array.isArray(r?.executable)) return r.executable
  if (Array.isArray(r?.instructions)) return r.instructions
  if (Array.isArray(r?.executableInstructions)) return r.executableInstructions
  if (Array.isArray(r?.program?.executable)) return r.program.executable
  if (Array.isArray(r?.program?.instructions)) return r.program.instructions

  throw new Error(
    'compileBotSource result does not expose an executable instruction list (expected `executable`/`instructions`)'
  )
}

/**
 * @param {any} r
 */
function getPcToSourceLine(r) {
  if (Array.isArray(r?.pcToSourceLine)) return r.pcToSourceLine
  if (Array.isArray(r?.program?.pcToSourceLine)) return r.program.pcToSourceLine

  throw new Error('compileBotSource result does not expose `pcToSourceLine`')
}

/**
 * @param {any} instr
 */
function getOp(instr) {
  if (typeof instr === 'string') return instr.trim().split(/\s+/)[0]
  if (Array.isArray(instr)) return instr[0]
  if (instr && typeof instr === 'object') return instr.op ?? instr.kind ?? instr.type
  return undefined
}

/**
 * @param {any} instr
 */
function getCanonicalOp(instr) {
  const op = getOp(instr)
  if (op === 'USE_SLOT' && instr && typeof instr === 'object' && Number.isInteger(instr.slot)) {
    return `USE_SLOT${instr.slot}`
  }
  return op
}

/**
 * @param {any} instr
 */
function getTargetToken(instr) {
  if (typeof instr === 'string') return instr.trim().split(/\s+/)[1]
  if (Array.isArray(instr)) return instr[1]
  if (!instr || typeof instr !== 'object') return undefined

  const direct = instr.target ?? instr.botTarget ?? instr.arg ?? instr.targetToken
  if (typeof direct === 'string') return direct

  if (Array.isArray(instr.args) && typeof instr.args[0] === 'string') return instr.args[0]

  if (instr.target && typeof instr.target === 'object') {
    const nested = instr.target.kind ?? instr.target.op ?? instr.target.name
    if (typeof nested === 'string') return nested
  }

  return undefined
}

/**
 * @param {any} instr
 */
function getGotoTargetPc(instr) {
  if (typeof instr === 'string') {
    const tok = instr.trim().split(/\s+/)[1]
    const n = Number(tok)
    return Number.isInteger(n) ? n : undefined
  }

  if (Array.isArray(instr)) {
    const n = instr[1]
    return Number.isInteger(n) ? n : undefined
  }

  if (!instr || typeof instr !== 'object') return undefined

  const candidates = [
    instr.toPc,
    instr.targetPc,
    instr.gotoPc,
    instr.jumpPc,
    instr.destPc,
    instr.addr,
    instr.to,
    instr.dest,
  ]

  for (const c of candidates) if (Number.isInteger(c)) return c

  return undefined
}

/**
 * @param {any} r
 * @param {any[]} executable
 * @param {string} name
 */
function assertNoUnresolvedLabels(r, executable, name) {
  const unresolved = r?.unresolvedLabels ?? r?.unresolvedGotos ?? r?.unresolved
  if (Array.isArray(unresolved)) {
    assert.deepStrictEqual(unresolved, [], `expected no unresolved labels for ${name}`)
    return
  }

  const gotoInstrs = executable.filter((instr) => /GOTO/.test(String(getOp(instr) ?? '')))
  if (gotoInstrs.length === 0) {
    const labelMap = r?.labelMap ?? r?.labels ?? r?.labelToPc ?? r?.program?.labelMap ?? r?.program?.labels
    assert.ok(labelMap != null, `expected a label map or resolved gotos for ${name}`)
    return
  }

  for (const instr of gotoInstrs) {
    const hasStringLabelField =
      instr &&
      typeof instr === 'object' &&
      typeof (instr.label ?? instr.gotoLabel ?? instr.targetLabel ?? instr.destLabel) === 'string'

    assert.equal(hasStringLabelField, false, `expected gotos to be resolved (no label strings) for ${name}`)

    const pc = getGotoTargetPc(instr)
    assert.ok(Number.isInteger(pc), `expected goto target pc to be an integer for ${name}`)
  }
}

/**
 * @param {string} name
 * @param {string} sourceText
 */
function compileAndAssertOk(name, sourceText) {
  const r1 = compileBotSource(sourceText)
  const r2 = compileBotSource(sourceText)

  // Determinism check: compilation must be pure and stable.
  assert.deepStrictEqual(r2, r1, `expected deterministic compile output for ${name}`)

  const errors = r1?.errors ?? []
  assert.deepStrictEqual(errors, [], `expected no compile errors for ${name}`)

  const executable = getExecutableInstructions(r1)
  assert.ok(executable.length > 0, `expected non-empty executable instruction list for ${name}`)

  const pcToSourceLine = getPcToSourceLine(r1)
  assert.equal(
    pcToSourceLine.length,
    executable.length + 1,
    `expected pcToSourceLine length == instruction count + 1 (pc0) for ${name}`
  )

  assert.equal(pcToSourceLine[0], 0, `pcToSourceLine[0] must be 0 for ${name}`)

  for (let pc = 1; pc < pcToSourceLine.length; pc++) {
    assert.ok(
      Number.isInteger(pcToSourceLine[pc]) && pcToSourceLine[pc] > 0,
      `pcToSourceLine[${pc}] must be a positive int for ${name}`
    )
  }

  assertNoUnresolvedLabels(r1, executable, name)

  return { r: r1, executable }
}

test('compileBotSource compiles example bots (bot0..bot6)', () => {
  for (let i = 0; i <= 6; i++) {
    const filename = path.join(repoRoot, 'examples', `bot${i}.md`)
    const md = readFileSync(filename, 'utf8')
    const sourceText = extractTextFence(md)

    compileAndAssertOk(`bot${i}`, sourceText)
  }
})

test('compileBotSource normalizes aliases: FIRE_SLOT1 NEAREST_BOT -> USE_SLOT1 CLOSEST_BOT', () => {
  const { executable } = compileAndAssertOk('alias normalization', 'FIRE_SLOT1 NEAREST_BOT\n')

  const instr0 = executable[0]
  assert.equal(getCanonicalOp(instr0), 'USE_SLOT1')
  assert.equal(getTargetToken(instr0), 'CLOSEST_BOT')
})
