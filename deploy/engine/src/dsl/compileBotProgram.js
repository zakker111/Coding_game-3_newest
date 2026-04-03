import { parseExpression } from './expr.js'

/**
 * @typedef {{ line: number, message: string }} BotCompileIssue
 */

/**
 * @typedef {'HEALTH' | 'AMMO' | 'ENERGY'} PowerupType
 */

/**
 * @typedef {'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'} BotId
 */

/**
 * @typedef {'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'UP_LEFT' | 'UP_RIGHT' | 'DOWN_LEFT' | 'DOWN_RIGHT'} MoveDir
 */

/**
 * @typedef {(
 *   | { kind: 'INVALID' }
 *   | { kind: 'NOP' }
 *   | { kind: 'WAIT', ticks: number }
 *   | { kind: 'GOTO', label: string, pc: number }
 *   | { kind: 'IF_GOTO', expr: import('./expr.js').Expr, label: string, pc: number }
 *   | { kind: 'IF_DO', expr: import('./expr.js').Expr, instruction: BotRuntimeInstruction }
 *   | { kind: 'SET_TIMER', timer: 1 | 2 | 3, ticks: number }
 *   | { kind: 'CLEAR_TIMER', timer: 1 | 2 | 3 }
 *   | { kind: 'TARGET_CLOSEST' }
 *   | { kind: 'TARGET_CLOSEST_BULLET' }
 *   | { kind: 'TARGET_LOWEST_HEALTH' }
 *   | { kind: 'TARGET_NEXT' }
 *   | { kind: 'TARGET_NEXT_IF_DEAD' }
 *   | { kind: 'TARGET_POWERUP', type: PowerupType }
 *   | { kind: 'SET_TARGET', bot: BotId }
 *   | { kind: 'CLEAR_TARGET_BOT' }
 *   | { kind: 'CLEAR_TARGET_POWERUP' }
 *   | { kind: 'CLEAR_TARGET' }
 *   | { kind: 'MOVE_DIR', dir: MoveDir }
 *   | { kind: 'SET_MOVE_TO_TARGET' }
 *   | { kind: 'SET_MOVE_TO_ZONE', zone: 1 | 2 | 3 | 4 }
 *   | { kind: 'SET_MOVE_TO_SECTOR', sector: 1|2|3|4|5|6|7|8|9, zone?: 1|2|3|4 }
 *   | { kind: 'SET_MOVE_TO_POWERUP', type: PowerupType }
 *   | { kind: 'SET_MOVE_TO_BOT', target: string }
 *   | { kind: 'MOVE_TO_TARGET' }
 *   | { kind: 'MOVE_AWAY_FROM_TARGET' }
 *   | { kind: 'MOVE_TO_ZONE', zone: 1 | 2 | 3 | 4 }
 *   | { kind: 'MOVE_TO_SECTOR', sector: 1|2|3|4|5|6|7|8|9, zone?: 1|2|3|4 }
 *   | { kind: 'MOVE_TO_BOT', target: string }
 *   | { kind: 'MOVE_TO_CLOSEST_BOT' }
 *   | { kind: 'MOVE_TO_LOWEST_HEALTH_BOT' }
 *   | { kind: 'MOVE_TO_POWERUP', type: PowerupType }
 *   | { kind: 'MOVE_TO_ARENA_EDGE', dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' }
 *   | { kind: 'CLEAR_MOVE' }
 *   | { kind: 'MODULE_TOGGLE', module: 'SAW' | 'SHIELD', on: boolean }
 *   | { kind: 'USE_SLOT', slot: 1 | 2 | 3, target: string }
 *   | { kind: 'STOP_SLOT', slot: 1 | 2 | 3 }
 * )} BotInstruction
 */

/**
 * @typedef {Exclude<BotInstruction, { kind: 'GOTO' } | { kind: 'IF_GOTO' }>} BotRuntimeInstruction
 */

const OPCODE_ALIASES = new Map([
  ['TARGET_NEAREST', 'TARGET_CLOSEST'],
  ['TARGET_CLOSEST_BOT', 'TARGET_CLOSEST'],
  ['TARGET_WEAKEST', 'TARGET_LOWEST_HEALTH'],
  ['TARGET_CLOSEST_POWERUP', 'TARGET_POWERUP'],
  ['MOVE_TO_CLOSEST_POWERUP', 'MOVE_TO_POWERUP'],
  ['MOVE_TO_NEAREST_BOT', 'MOVE_TO_CLOSEST_BOT'],
  ['MOVE_TO_WEAKEST_BOT', 'MOVE_TO_LOWEST_HEALTH_BOT'],
  ['MOVE_TO_WALL', 'MOVE_TO_ARENA_EDGE'],

  // Module-type sugar (v1): default weapon is SLOT1, so FIRE_BULLET compiles to USE_SLOT1.
  ['FIRE_BULLET', 'USE_SLOT1'],
])

const TARGET_TOKEN_ALIASES = new Map([
  ['NEAREST_BOT', 'CLOSEST_BOT'],
  ['WEAKEST_BOT', 'LOWEST_HEALTH_BOT'],
])

/**
 * Compile a v1 bot script to a small canonical IR.
 *
 * - Blank lines are ignored.
 * - Comment lines are ignored if the first non-whitespace char is `;`.
 * - `LABEL <name>` is compile-time only and removed.
 * - Jumps are resolved to 1-indexed pcs.
 *
 * @param {string} sourceText
 * @returns {{ program: { instructions: BotInstruction[], pcToSourceLine: number[], labels: Record<string, number> }, errors: BotCompileIssue[] }}
 */
export function compileBotProgram(sourceText) {
  const normalized = sourceText.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')

  /** @type {BotCompileIssue[]} */
  const errors = []

  /** @type {BotInstruction[]} */
  const instructions = []

  /** @type {Map<string, number>} */
  const labelToPc = new Map()

  /** @type {number[]} */
  const pcToSourceLine = [0]

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue

    // v1 source preprocessing: comments are ignored if the *first non-whitespace* char is `;`.
    // (See BotInstructions.md §0)
    if (trimmed.startsWith(';')) continue

    if (/^LABEL\b/i.test(trimmed)) {
      const label = normalizeLabelName(trimmed.replace(/^LABEL\b/i, '').trim())
      if (!label) {
        errors.push({ line: lineNo, message: 'Invalid label name' })
        continue
      }

      const pc = instructions.length + 1
      if (labelToPc.has(label)) {
        errors.push({ line: lineNo, message: `Duplicate label: ${label}` })
        continue
      }

      labelToPc.set(label, pc)
      continue
    }

    const instr = parseInstructionLine(trimmed, lineNo, errors)
    instructions.push(instr)
    pcToSourceLine.push(lineNo)
  }

  for (let i = 0; i < instructions.length; i++) {
    const instr = instructions[i]

    if (instr.kind === 'GOTO' || instr.kind === 'IF_GOTO') {
      const pc = labelToPc.get(instr.label)
      if (!pc) {
        errors.push({ line: pcToSourceLine[i + 1], message: `Unknown label: ${instr.label}` })
        instructions[i] = { kind: 'INVALID' }
        continue
      }

      instr.pc = pc
    }
  }

  return {
    program: {
      instructions,
      pcToSourceLine,
      // Exposed for debug + for downstream tooling/tests.
      labels: Object.fromEntries(labelToPc.entries()),
    },
    errors,
  }
}

/**
 * @param {string} name
 */
function normalizeLabelName(name) {
  const t = name.trim().toUpperCase()
  if (!/^[A-Z_][A-Z0-9_]*$/.test(t)) return null
  return t
}

/**
 * @param {string} token
 */
function normalizeOpcodeToken(token) {
  const upper = token.toUpperCase()

  const fireSlot = upper.match(/^FIRE_SLOT([123])$/)
  if (fireSlot) return `USE_SLOT${fireSlot[1]}`

  return OPCODE_ALIASES.get(upper) ?? upper
}

/**
 * @param {string} token
 */
function normalizeTargetToken(token) {
  const upper = token.toUpperCase()
  return TARGET_TOKEN_ALIASES.get(upper) ?? upper
}

/**
 * @param {string} line
 * @param {number} lineNo
 * @param {BotCompileIssue[]} errors
 * @returns {BotInstruction}
 */
function parseInstructionLine(line, lineNo, errors) {
  if (/^IF\b/i.test(line)) {
    return parseIfLine(line, lineNo, errors)
  }

  return parseSimpleInstruction(line, lineNo, errors)
}

/**
 * @param {string} line
 * @param {number} lineNo
 * @param {BotCompileIssue[]} errors
 * @returns {BotInstruction}
 */
function parseIfLine(line, lineNo, errors) {
  const rest = line.replace(/^IF\b/i, '').trim()

  /** @type {'GOTO' | 'DO' | ''} */
  let action = ''
  let exprText = ''
  let tail = ''

  const paren = splitLeadingParenExpr(rest)
  if (paren.ok) {
    exprText = paren.exprText

    const rem = paren.remainder.trim()
    const upperRem = rem.toUpperCase()

    if (upperRem.startsWith('GOTO ')) {
      action = 'GOTO'
      tail = rem.slice(5).trim()
    } else if (upperRem.startsWith('DO ')) {
      action = 'DO'
      tail = rem.slice(3).trim()
    } else {
      errors.push({ line: lineNo, message: 'Malformed IF: expected GOTO <label> or DO <instruction>' })
      return { kind: 'INVALID' }
    }
  } else {
    const upperRest = rest.toUpperCase()
    const gotoSep = ' GOTO '
    const doSep = ' DO '

    const gotoIdx = upperRest.indexOf(gotoSep)
    const doIdx = upperRest.indexOf(doSep)

    if (gotoIdx !== -1 && (doIdx === -1 || gotoIdx < doIdx)) {
      action = 'GOTO'
      exprText = rest.slice(0, gotoIdx).trim()
      tail = rest.slice(gotoIdx + gotoSep.length).trim()
    } else if (doIdx !== -1) {
      action = 'DO'
      exprText = rest.slice(0, doIdx).trim()
      tail = rest.slice(doIdx + doSep.length).trim()
    } else {
      errors.push({ line: lineNo, message: 'Malformed IF: expected GOTO <label> or DO <instruction>' })
      return { kind: 'INVALID' }
    }

    if (!exprText) {
      errors.push({ line: lineNo, message: 'Malformed IF: missing expression' })
      return { kind: 'INVALID' }
    }
  }

  let expr
  try {
    expr = normalizeExpr(parseExpression(exprText))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    errors.push({ line: lineNo, message: `Malformed IF expression: ${message}` })
    return { kind: 'INVALID' }
  }

  if (action === 'GOTO') {
    const label = normalizeLabelName(tail)
    if (!label) {
      errors.push({ line: lineNo, message: 'Invalid label name' })
      return { kind: 'INVALID' }
    }

    return { kind: 'IF_GOTO', expr, label, pc: 0 }
  }

  if (action === 'DO') {
    const instructionText = tail
    const instruction = parseSimpleInstruction(instructionText, lineNo, errors)

    if (
      instruction.kind === 'GOTO' ||
      instruction.kind === 'IF_GOTO' ||
      instruction.kind === 'IF_DO' ||
      instruction.kind === 'WAIT'
    ) {
      errors.push({ line: lineNo, message: 'IF ... DO cannot execute a control-flow instruction' })
      return { kind: 'INVALID' }
    }

    return { kind: 'IF_DO', expr, instruction }
  }

  errors.push({ line: lineNo, message: 'Malformed IF: expected GOTO <label> or DO <instruction>' })
  return { kind: 'INVALID' }
}

/**
 * @param {string} s
 */
function splitLeadingParenExpr(s) {
  const t = s.trimStart()
  if (!t.startsWith('(')) return { ok: false, exprText: '', remainder: '' }

  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '(') depth++
    if (ch === ')') {
      depth--
      if (depth === 0) {
        return { ok: true, exprText: t.slice(1, i), remainder: t.slice(i + 1) }
      }
    }
  }

  return { ok: false, exprText: '', remainder: '' }
}

/**
 * @param {string} line
 * @param {number} lineNo
 * @param {BotCompileIssue[]} errors
 * @returns {BotInstruction}
 */
function parseSimpleInstruction(line, lineNo, errors) {
  const parts = line.trim().split(/\s+/g).filter(Boolean)
  if (parts.length === 0) return { kind: 'INVALID' }

  const op = normalizeOpcodeToken(parts[0])

  if (op === 'NOP') return { kind: 'NOP' }

  if (op === 'GOTO') {
    const label = normalizeLabelName(parts[1] ?? '')
    if (!label) {
      errors.push({ line: lineNo, message: 'GOTO expects a label name' })
      return { kind: 'INVALID' }
    }
    return { kind: 'GOTO', label, pc: 0 }
  }

  if (op === 'WAIT') {
    const ticks = parsePositiveInt(parts[1])
    if (!ticks) {
      errors.push({ line: lineNo, message: 'WAIT expects a positive integer tick count' })
      return { kind: 'INVALID' }
    }
    return { kind: 'WAIT', ticks }
  }

  if (op === 'SET_TIMER') {
    const timer = parseTimer(parts[1])
    const ticks = parsePositiveInt(parts[2])
    if (!timer || !ticks) {
      errors.push({ line: lineNo, message: 'SET_TIMER expects: SET_TIMER T1|T2|T3 <positiveInt>' })
      return { kind: 'INVALID' }
    }
    return { kind: 'SET_TIMER', timer, ticks }
  }

  if (op === 'CLEAR_TIMER') {
    const timer = parseTimer(parts[1])
    if (!timer) {
      errors.push({ line: lineNo, message: 'CLEAR_TIMER expects: CLEAR_TIMER T1|T2|T3' })
      return { kind: 'INVALID' }
    }
    return { kind: 'CLEAR_TIMER', timer }
  }

  if (op === 'TARGET_CLOSEST') return { kind: 'TARGET_CLOSEST' }

  if (op === 'TARGET_CLOSEST_BULLET') return { kind: 'TARGET_CLOSEST_BULLET' }

  if (op === 'TARGET_LOWEST_HEALTH') return { kind: 'TARGET_LOWEST_HEALTH' }

  if (op === 'TARGET_NEXT') return { kind: 'TARGET_NEXT' }

  if (op === 'TARGET_NEXT_IF_DEAD') return { kind: 'TARGET_NEXT_IF_DEAD' }

  if (op === 'TARGET_POWERUP') {
    const type = parsePowerupType(parts[1])
    if (!type) {
      errors.push({ line: lineNo, message: 'TARGET_POWERUP expects: HEALTH|AMMO|ENERGY' })
      return { kind: 'INVALID' }
    }
    return { kind: 'TARGET_POWERUP', type }
  }

  if (op === 'SET_TARGET') {
    const bot = parseBotId(parts[1])
    if (!bot) {
      errors.push({ line: lineNo, message: 'SET_TARGET expects: BOT1|BOT2|BOT3|BOT4' })
      return { kind: 'INVALID' }
    }
    return { kind: 'SET_TARGET', bot }
  }

  if (op === 'CLEAR_TARGET_BOT') return { kind: 'CLEAR_TARGET_BOT' }
  if (op === 'CLEAR_TARGET_POWERUP') return { kind: 'CLEAR_TARGET_POWERUP' }
  if (op === 'CLEAR_TARGET') return { kind: 'CLEAR_TARGET' }

  if (op === 'MOVE') {
    const dir = parseMoveDir(parts[1])
    if (!dir || parts.length !== 2) {
      errors.push({
        line: lineNo,
        message: 'MOVE expects: UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT',
      })
      return { kind: 'INVALID' }
    }

    return { kind: 'MOVE_DIR', dir }
  }

  if (op === 'SET_MOVE_TO_TARGET') return { kind: 'SET_MOVE_TO_TARGET' }

  if (op === 'SET_MOVE_TO_ZONE') {
    const zone = parseZone(parts[1])
    if (!zone) {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_ZONE expects a zone number 1..4' })
      return { kind: 'INVALID' }
    }
    return { kind: 'SET_MOVE_TO_ZONE', zone }
  }

  if (op === 'SET_MOVE_TO_SECTOR') {
    const sector = parseSector(parts[1])
    if (!sector) {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_SECTOR expects a sector number 1..9' })
      return { kind: 'INVALID' }
    }

    if (parts.length === 2) return { kind: 'SET_MOVE_TO_SECTOR', sector }

    if (parts[2]?.toUpperCase() !== 'ZONE') {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_SECTOR expects: SET_MOVE_TO_SECTOR <n> [ZONE <z>]' })
      return { kind: 'INVALID' }
    }

    const zone = parseZone(parts[3])
    if (!zone) {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_SECTOR ... ZONE expects a zone number 1..4' })
      return { kind: 'INVALID' }
    }

    return { kind: 'SET_MOVE_TO_SECTOR', sector, zone }
  }

  if (op === 'SET_MOVE_TO_POWERUP') {
    const type = parsePowerupType(parts[1])
    if (!type) {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_POWERUP expects: HEALTH|AMMO|ENERGY' })
      return { kind: 'INVALID' }
    }
    return { kind: 'SET_MOVE_TO_POWERUP', type }
  }

  if (op === 'SET_MOVE_TO_BOT') {
    const token = parts[1]
    if (!token || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'SET_MOVE_TO_BOT expects exactly 1 bot target token' })
      return { kind: 'INVALID' }
    }
    return { kind: 'SET_MOVE_TO_BOT', target: normalizeTargetToken(token) }
  }

  // Immediate movement helpers (not yet used by the sample replay generator, but part of stable v1).
  if (op === 'MOVE_TO_TARGET') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: 'MOVE_TO_TARGET expects no arguments' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_TARGET' }
  }

  if (op === 'MOVE_AWAY_FROM_TARGET') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: 'MOVE_AWAY_FROM_TARGET expects no arguments' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_AWAY_FROM_TARGET' }
  }

  if (op === 'MOVE_TO_ZONE') {
    const zone = parseZone(parts[1])
    if (!zone || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'MOVE_TO_ZONE expects a zone number 1..4' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_ZONE', zone }
  }

  if (op === 'MOVE_TO_SECTOR') {
    const sector = parseSector(parts[1])
    if (!sector) {
      errors.push({ line: lineNo, message: 'MOVE_TO_SECTOR expects a sector number 1..9' })
      return { kind: 'INVALID' }
    }

    if (parts.length === 2) return { kind: 'MOVE_TO_SECTOR', sector }

    if (parts.length === 4 && parts[2]?.toUpperCase() === 'ZONE') {
      const zone = parseZone(parts[3])
      if (!zone) {
        errors.push({ line: lineNo, message: 'MOVE_TO_SECTOR ... ZONE expects a zone number 1..4' })
        return { kind: 'INVALID' }
      }
      return { kind: 'MOVE_TO_SECTOR', sector, zone }
    }

    errors.push({ line: lineNo, message: 'MOVE_TO_SECTOR expects: MOVE_TO_SECTOR <n> [ZONE <z>]' })
    return { kind: 'INVALID' }
  }

  if (op === 'MOVE_TO_BOT') {
    const token = parts[1]
    if (!token || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'MOVE_TO_BOT expects exactly 1 bot target token' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_BOT', target: normalizeTargetToken(token) }
  }

  if (op === 'MOVE_TO_CLOSEST_BOT') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: 'MOVE_TO_CLOSEST_BOT expects no arguments' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_CLOSEST_BOT' }
  }

  if (op === 'MOVE_TO_LOWEST_HEALTH_BOT') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: 'MOVE_TO_LOWEST_HEALTH_BOT expects no arguments' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_LOWEST_HEALTH_BOT' }
  }

  if (op === 'MOVE_TO_POWERUP') {
    const type = parsePowerupType(parts[1])
    if (!type || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'MOVE_TO_POWERUP expects: HEALTH|AMMO|ENERGY' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_POWERUP', type }
  }

  if (op === 'MOVE_TO_ARENA_EDGE') {
    const dir = parts[1]?.toUpperCase()
    if ((dir !== 'UP' && dir !== 'DOWN' && dir !== 'LEFT' && dir !== 'RIGHT') || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'MOVE_TO_ARENA_EDGE expects: UP|DOWN|LEFT|RIGHT' })
      return { kind: 'INVALID' }
    }
    return { kind: 'MOVE_TO_ARENA_EDGE', dir }
  }

  if (op === 'CLEAR_MOVE') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: 'CLEAR_MOVE expects no arguments' })
      return { kind: 'INVALID' }
    }
    return { kind: 'CLEAR_MOVE' }
  }

  if (op === 'SAW' || op === 'SHIELD') {
    const arg = parts[1]?.toUpperCase()
    if (arg !== 'ON' && arg !== 'OFF') {
      errors.push({ line: lineNo, message: `${op} expects: ${op} ON|OFF` })
      return { kind: 'INVALID' }
    }

    return { kind: 'MODULE_TOGGLE', module: op, on: arg === 'ON' }
  }

  if (op === 'FIRE_TARGET') {
    const slotTok = (parts[1] ?? '').toUpperCase()
    const slot = slotTok === 'SLOT1' ? 1 : slotTok === 'SLOT2' ? 2 : slotTok === 'SLOT3' ? 3 : 0

    if (!slot || parts.length !== 2) {
      errors.push({ line: lineNo, message: 'FIRE_TARGET expects: FIRE_TARGET SLOT1|SLOT2|SLOT3' })
      return { kind: 'INVALID' }
    }

    // Convenience: use the current target register.
    return { kind: 'USE_SLOT', slot: /** @type {1|2|3} */ (slot), target: 'TARGET' }
  }

  if (op === 'USE_SLOT1' || op === 'USE_SLOT2' || op === 'USE_SLOT3') {
    const slot = /** @type {1|2|3} */ (Number.parseInt(op.slice(-1), 10))
    const target = parts[1]

    if (!target || parts.length !== 2) {
      errors.push({ line: lineNo, message: `${op} expects exactly 1 target token` })
      return { kind: 'INVALID' }
    }

    return { kind: 'USE_SLOT', slot, target: normalizeTargetToken(target) }
  }

  if (op === 'STOP_SLOT1' || op === 'STOP_SLOT2' || op === 'STOP_SLOT3') {
    if (parts.length !== 1) {
      errors.push({ line: lineNo, message: `${op} expects no arguments` })
      return { kind: 'INVALID' }
    }

    const slot = /** @type {1|2|3} */ (Number.parseInt(op.slice(-1), 10))
    return { kind: 'STOP_SLOT', slot }
  }

  errors.push({ line: lineNo, message: `Unknown instruction: ${op}` })
  return { kind: 'INVALID' }
}

/**
 * @param {string | undefined} s
 */
function parsePositiveInt(s) {
  if (!s) return 0
  const n = Number.parseInt(s, 10)
  if (!Number.isInteger(n) || n <= 0) return 0
  return n
}

/**
 * @param {string | undefined} s
 * @returns {1|2|3|0}
 */
function parseTimer(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'T1') return 1
  if (t === 'T2') return 2
  if (t === 'T3') return 3
  return 0
}

/**
 * @param {string | undefined} s
 * @returns {BotId | null}
 */
function parseBotId(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'BOT1') return 'BOT1'
  if (t === 'BOT2') return 'BOT2'
  if (t === 'BOT3') return 'BOT3'
  if (t === 'BOT4') return 'BOT4'
  return null
}

/**
 * @param {string | undefined} s
 * @returns {PowerupType | null}
 */
function parsePowerupType(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'HEALTH') return 'HEALTH'
  if (t === 'AMMO') return 'AMMO'
  if (t === 'ENERGY') return 'ENERGY'
  return null
}

/**
 * @param {string | undefined} s
 * @returns {1|2|3|4|0}
 */
function parseZone(s) {
  const n = Number.parseInt(s ?? '', 10)
  if (!Number.isInteger(n) || n < 1 || n > 4) return 0
  return /** @type {1|2|3|4} */ (n)
}

/**
 * @param {string | undefined} s
 * @returns {1|2|3|4|5|6|7|8|9|0}
 */
function parseSector(s) {
  const n = Number.parseInt(s ?? '', 10)
  if (!Number.isInteger(n) || n < 1 || n > 9) return 0
  return /** @type {1|2|3|4|5|6|7|8|9} */ (n)
}

/**
 * @param {string | undefined} s
 * @returns {MoveDir | null}
 */
function parseMoveDir(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'UP') return 'UP'
  if (t === 'DOWN') return 'DOWN'
  if (t === 'LEFT') return 'LEFT'
  if (t === 'RIGHT') return 'RIGHT'
  if (t === 'UP_LEFT') return 'UP_LEFT'
  if (t === 'UP_RIGHT') return 'UP_RIGHT'
  if (t === 'DOWN_LEFT') return 'DOWN_LEFT'
  if (t === 'DOWN_RIGHT') return 'DOWN_RIGHT'
  return null
}

/**
 * @param {import('./expr.js').Expr} expr
 * @returns {import('./expr.js').Expr}
 */
function normalizeExpr(expr) {
  if (expr.type === 'Identifier') {
    return { ...expr, name: expr.name.toUpperCase() }
  }

  if (expr.type === 'CallExpression') {
    return {
      ...expr,
      callee: { ...expr.callee, name: expr.callee.name.toUpperCase() },
      arguments: expr.arguments.map(normalizeExpr),
    }
  }

  if (expr.type === 'UnaryExpression') {
    return { ...expr, argument: normalizeExpr(expr.argument) }
  }

  if (expr.type === 'BinaryExpression') {
    return { ...expr, left: normalizeExpr(expr.left), right: normalizeExpr(expr.right) }
  }

  return expr
}
