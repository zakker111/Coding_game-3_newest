import { compileBotProgram } from './compileBotProgram.js'

/**
 * Runtime-friendly wrapper around `compileBotProgram`.
 *
 * Guarantees for downstream consumers/tests:
 * - `program.pcToSourceLine[0] === 0`
 * - `program.pcToSourceLine.length === program.instructions.length + 1`
 * - control-flow instructions do not retain any string label fields (labels are resolved to numeric `targetPc`)
 * - stable-v1 sugar is normalized into a very small canonical core (targets, movement)
 *
 * @param {string} sourceText
 * @returns {{ program: { instructions: any[], pcToSourceLine: number[], labels?: Record<string, number> }, errors: {line:number,message:string}[] }}
 */
export function compileBotSource(sourceText) {
  const r = compileBotProgram(sourceText)

  const instructions = r.program.instructions.map(normalizeInstruction)

  return {
    program: {
      instructions,
      pcToSourceLine: r.program.pcToSourceLine,
      labels: r.program.labels ?? {},
    },
    errors: r.errors,
  }
}

/**
 * Convert stable-v1 parsed instructions into a smaller canonical core IR.
 *
 * Note: target tokens are already normalized in `compileBotProgram`.
 *
 * @param {any} instr
 * @returns {any}
 */
function normalizeInstruction(instr) {
  if (!instr || typeof instr !== 'object') return instr

  // Control flow.
  if (instr.kind === 'GOTO') return { kind: 'JUMP', targetPc: instr.pc }
  if (instr.kind === 'IF_GOTO') return { kind: 'IF_JUMP', expr: instr.expr, targetPc: instr.pc }
  if (instr.kind === 'IF_DO') return { kind: 'IF_DO', expr: instr.expr, instruction: normalizeInstruction(instr.instruction) }

  // Target register writes.
  if (instr.kind === 'SET_TARGET') return { kind: 'SET_TARGET_BOT', selector: instr.bot }
  if (instr.kind === 'TARGET_CLOSEST') return { kind: 'SET_TARGET_BOT', selector: 'CLOSEST_BOT' }
  if (instr.kind === 'TARGET_LOWEST_HEALTH') return { kind: 'SET_TARGET_BOT', selector: 'LOWEST_HEALTH_BOT' }
  if (instr.kind === 'TARGET_NEXT') return { kind: 'SET_TARGET_BOT', selector: 'NEXT' }
  if (instr.kind === 'TARGET_NEXT_IF_DEAD') return { kind: 'SET_TARGET_BOT', selector: 'NEXT_IF_DEAD' }
  if (instr.kind === 'TARGET_CLOSEST_BULLET') return { kind: 'SET_TARGET_BULLET', selector: 'CLOSEST_BULLET' }
  if (instr.kind === 'TARGET_POWERUP') return { kind: 'SET_TARGET_POWERUP', type: instr.type }

  if (instr.kind === 'CLEAR_TARGET_BOT') return { kind: 'CLEAR_TARGET', which: 'BOT' }
  if (instr.kind === 'CLEAR_TARGET_POWERUP') return { kind: 'CLEAR_TARGET', which: 'POWERUP' }
  if (instr.kind === 'CLEAR_TARGET_BULLET') return { kind: 'CLEAR_TARGET', which: 'BULLET' }
  if (instr.kind === 'CLEAR_TARGET') return { kind: 'CLEAR_TARGET', which: 'ALL' }

  // Persistent movement goal writes.
  if (instr.kind === 'SET_MOVE_TO_TARGET') return { kind: 'SET_MOVE', target: { kind: 'TARGET' } }
  if (instr.kind === 'SET_MOVE_TO_ZONE') return { kind: 'SET_MOVE', target: { kind: 'ZONE_IN_CURRENT_SECTOR', zone: instr.zone } }
  if (instr.kind === 'SET_MOVE_TO_SECTOR') {
    return {
      kind: 'SET_MOVE',
      target: instr.zone
        ? { kind: 'SECTOR', sector: instr.sector, zone: instr.zone }
        : { kind: 'SECTOR', sector: instr.sector },
    }
  }
  if (instr.kind === 'SET_MOVE_TO_POWERUP') return { kind: 'SET_MOVE', target: { kind: 'POWERUP', type: instr.type } }
  if (instr.kind === 'SET_MOVE_TO_BOT') return { kind: 'SET_MOVE', target: { kind: 'BOT', token: instr.target } }

  // Immediate movement.
  if (instr.kind === 'MOVE_TO_TARGET') return { kind: 'MOVE', target: { kind: 'TARGET' } }
  if (instr.kind === 'MOVE_AWAY_FROM_TARGET') return { kind: 'MOVE', target: { kind: 'TARGET_AWAY' } }
  if (instr.kind === 'MOVE_TO_ZONE') return { kind: 'MOVE', target: { kind: 'ZONE_IN_CURRENT_SECTOR', zone: instr.zone } }
  if (instr.kind === 'MOVE_TO_SECTOR') {
    return {
      kind: 'MOVE',
      target: instr.zone
        ? { kind: 'SECTOR', sector: instr.sector, zone: instr.zone }
        : { kind: 'SECTOR', sector: instr.sector },
    }
  }
  if (instr.kind === 'MOVE_TO_POWERUP') return { kind: 'MOVE', target: { kind: 'POWERUP', type: instr.type } }
  if (instr.kind === 'MOVE_TO_BOT') return { kind: 'MOVE', target: { kind: 'BOT', token: instr.target } }
  if (instr.kind === 'MOVE_TO_CLOSEST_BOT') return { kind: 'MOVE', target: { kind: 'BOT', token: 'CLOSEST_BOT' } }
  if (instr.kind === 'MOVE_TO_LOWEST_HEALTH_BOT') return { kind: 'MOVE', target: { kind: 'BOT', token: 'LOWEST_HEALTH_BOT' } }
  if (instr.kind === 'MOVE_TO_ARENA_EDGE') return { kind: 'MOVE', target: { kind: 'ARENA_EDGE', dir: instr.dir } }

  // Already-canonical instructions pass through:
  // - MOVE_DIR, CLEAR_MOVE
  // - NOP, WAIT, SET_TIMER, CLEAR_TIMER
  // - MODULE_TOGGLE, USE_SLOT, STOP_SLOT
  // - INVALID
  return instr
}
