import { parseExpression } from './expr.js'

/**
 * @typedef {import('./expr.js').Expr} Expr
 *
 * @typedef {(
 *   | { ok: true, value: number | boolean }
 *   | { ok: false, error: { code: string, message: string } }
 * )} EvalResult
 */

/**
 * Evaluation context for expression execution.
 *
 * This is intentionally small + mock-friendly. The VM/sim layer can provide
 * these values from current game state.
 *
 * All numeric values MUST be integers.
 *
 * @typedef {object} EvalCtx
 * @property {Record<string, number>} [vars] Integer variables, e.g. { HEALTH, AMMO, ENERGY }.
 * @property {(name: string) => (number | undefined)} [getVar]
 *
 * @property {Set<string> | Record<string, boolean> | ((type: string) => boolean)} [powerups]
 * Convenience: if provided as Set/Record, used by POWERUP_EXISTS.
 * @property {(type: 'HEALTH'|'AMMO'|'ENERGY') => boolean} [powerupExists]
 *
 * @property {Record<string, boolean> | ((botId: 'BOT1'|'BOT2'|'BOT3'|'BOT4') => boolean)} [botsAlive]
 * Convenience: if provided as Record, used by BOT_ALIVE.
 * @property {(botId: 'BOT1'|'BOT2'|'BOT3'|'BOT4') => boolean} [botAlive]
 *
 * @property {number} [zone] Current zone id (1..4).
 * @property {(zone: 1|2|3|4) => boolean} [inZone]
 *
 * @property {number | (() => number)} [distToClosestBot] Integer distance for DIST_TO_CLOSEST_BOT().
 *
 * @property {Record<string, number> | ((timer: 1|2|3) => number)} [timers]
 * Convenience: if provided as Record keyed by T1/T2/T3, used by TIMER_*.
 * @property {(timer: 1|2|3) => number} [timerRemaining]
 *
 * @property {Record<string, boolean> | ((slot: 1|2|3) => boolean)} [slotReady]
 * @property {Record<string, boolean> | ((slot: 1|2|3) => boolean)} [slotActive]
 *
 * @property {boolean | (() => boolean)} [hasTargetBot]
 * @property {boolean | (() => boolean)} [hasTargetBullet]
 *
 * @property {number | (() => number)} [distToTargetBullet]
 *
 * @property {boolean | (() => boolean)} [bumpedBot]
 *
 * @property {Record<string, (...args: (number|boolean)[]) => (number|boolean)>} [functions]
 * Escape hatch for future pure helper functions not yet hard-coded here.
 */

/**
 * Evaluate a stable-v1 expression.
 *
 * Runtime should call this with a pre-parsed AST (not source text) for
 * performance. String input is supported for tests and tooling.
 *
 * @param {Expr | string} exprOrSource
 * @param {EvalCtx} ctx
 * @returns {EvalResult}
 */
export function evalExpr(exprOrSource, ctx) {
  /** @type {Expr} */
  let expr

  if (typeof exprOrSource === 'string') {
    try {
      expr = parseExpression(exprOrSource)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return err('PARSE_ERROR', message)
    }
  } else {
    expr = exprOrSource
  }

  return evalNode(expr, ctx)
}

/** @param {number | boolean} value */
function ok(value) {
  return { ok: true, value }
}

/** @param {string} code @param {string} message */
function err(code, message) {
  return { ok: false, error: { code, message } }
}

/** @param {unknown} v */
function isInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {EvalResult}
 */
function evalNode(node, ctx) {
  if (node.type === 'IntLiteral') return ok(node.value)

  if (node.type === 'Identifier') {
    const name = node.name.toUpperCase()
    const v = resolveIdentifier(ctx, name)
    if (v == null) return err('UNKNOWN_IDENTIFIER', `Unknown identifier: ${name}`)
    if (!isInt(v)) return err('TYPE_ERROR', `Identifier ${name} is not an int`)
    return ok(v)
  }

  if (node.type === 'UnaryExpression') {
    if (node.operator !== '!') return err('UNSUPPORTED_OPERATOR', `Unsupported unary operator: ${node.operator}`)

    const r = evalBool(node.argument, ctx)
    if (!r.ok) return r
    return ok(!r.value)
  }

  if (node.type === 'BinaryExpression') {
    const op = node.operator

    if (op === '&&') {
      const left = evalBool(node.left, ctx)
      if (!left.ok) return left
      if (!left.value) return ok(false)

      const right = evalBool(node.right, ctx)
      if (!right.ok) return right
      return ok(left.value && right.value)
    }

    if (op === '||') {
      const left = evalBool(node.left, ctx)
      if (!left.ok) return left
      if (left.value) return ok(true)

      const right = evalBool(node.right, ctx)
      if (!right.ok) return right
      return ok(left.value || right.value)
    }

    const left = evalInt(node.left, ctx)
    if (!left.ok) return left

    const right = evalInt(node.right, ctx)
    if (!right.ok) return right

    if (op === '==') return ok(left.value === right.value)
    if (op === '!=') return ok(left.value !== right.value)
    if (op === '<') return ok(left.value < right.value)
    if (op === '<=') return ok(left.value <= right.value)
    if (op === '>') return ok(left.value > right.value)
    if (op === '>=') return ok(left.value >= right.value)

    return err('UNSUPPORTED_OPERATOR', `Unsupported binary operator: ${op}`)
  }

  if (node.type === 'CallExpression') {
    const fn = node.callee.name.toUpperCase()

    // Built-ins with token args.
    if (fn === 'POWERUP_EXISTS') {
      if (node.arguments.length !== 1) return err('ARITY', 'POWERUP_EXISTS expects 1 argument')
      const type = evalTokenArg(node.arguments[0])
      if (!type.ok) return type
      return ok(Boolean(resolvePowerupExists(ctx, type.value)))
    }

    if (fn === 'BOT_ALIVE') {
      if (node.arguments.length !== 1) return err('ARITY', 'BOT_ALIVE expects 1 argument')
      const bot = evalTokenArg(node.arguments[0])
      if (!bot.ok) return bot
      return ok(Boolean(resolveBotAlive(ctx, bot.value)))
    }

    if (fn === 'SECTOR') {
      if (node.arguments.length !== 0) return err('ARITY', 'SECTOR expects 0 arguments')
      const v = resolveIntish(ctx?.sector)
      if (v == null) return err('MISSING', 'SECTOR not available in ctx')
      return ok(v)
    }

    if (fn === 'ZONE') {
      if (node.arguments.length !== 0) return err('ARITY', 'ZONE expects 0 arguments')
      const v = resolveIntish(ctx?.zone)
      if (v == null) return err('MISSING', 'ZONE not available in ctx')
      return ok(v)
    }

    if (fn === 'IN_ZONE') {
      if (node.arguments.length !== 1) return err('ARITY', 'IN_ZONE expects 1 argument')
      const zone = evalInt(node.arguments[0], ctx)
      if (!zone.ok) return zone
      if (zone.value !== 1 && zone.value !== 2 && zone.value !== 3 && zone.value !== 4) {
        return err('RANGE', 'IN_ZONE zone must be 1..4')
      }
      return ok(Boolean(resolveInZone(ctx, /** @type {1|2|3|4} */ (zone.value))))
    }

    if (fn === 'DIST_TO_CLOSEST_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'DIST_TO_CLOSEST_BOT expects 0 arguments')
      const d = resolveDistToClosestBot(ctx)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_CLOSEST_BOT not available in ctx')
      return ok(d)
    }

    if (fn === 'BOT_IN_SAME_SECTOR' || fn === 'BOT_IN_ADJ_SECTOR') {
      if (node.arguments.length !== 1) return err('ARITY', `${fn} expects 1 argument`)
      const botTok = evalTokenArg(node.arguments[0])
      if (!botTok.ok) return botTok

      const selfSector = resolveIntish(ctx?.sector)
      if (selfSector == null) return err('MISSING', 'SECTOR not available in ctx')

      const otherSector = resolveBotSector(ctx, botTok.value)
      if (!isInt(otherSector)) return err('MISSING', `BOT sector not available in ctx: ${botTok.value}`)

      if (fn === 'BOT_IN_SAME_SECTOR') return ok(otherSector === selfSector)
      return ok(isAdjSector(selfSector, otherSector))
    }

    if (fn === 'DIST_TO_BOT') {
      if (node.arguments.length !== 1) return err('ARITY', 'DIST_TO_BOT expects 1 argument')
      const botTok = evalTokenArg(node.arguments[0])
      if (!botTok.ok) return botTok
      const d = resolveDistToBot(ctx, botTok.value)
      if (!isInt(d)) return err('MISSING', `DIST_TO_BOT not available in ctx for: ${botTok.value}`)
      return ok(d)
    }

    if (fn === 'DIST_TO_TARGET_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'DIST_TO_TARGET_BOT expects 0 arguments')
      const d = resolveDistToTargetBot(ctx)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_TARGET_BOT not available in ctx')
      return ok(d)
    }

    if (fn === 'DIST_TO_TARGET_BULLET') {
      if (node.arguments.length !== 0) return err('ARITY', 'DIST_TO_TARGET_BULLET expects 0 arguments')
      const d = resolveDistToTargetBullet(ctx)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_TARGET_BULLET not available in ctx')
      return ok(d)
    }

    if (fn === 'DIST_TO_SECTOR') {
      if (node.arguments.length !== 1) return err('ARITY', 'DIST_TO_SECTOR expects 1 argument')
      const s = evalInt(node.arguments[0], ctx)
      if (!s.ok) return s
      if (s.value < 1 || s.value > 9) return err('RANGE', 'DIST_TO_SECTOR sector must be 1..9')
      const d = resolveDistToSector(ctx, s.value)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_SECTOR not available in ctx')
      return ok(d)
    }

    if (fn === 'DIST_TO_SECTOR_ZONE') {
      if (node.arguments.length !== 2) return err('ARITY', 'DIST_TO_SECTOR_ZONE expects 2 arguments')
      const s = evalInt(node.arguments[0], ctx)
      if (!s.ok) return s
      if (s.value < 1 || s.value > 9) return err('RANGE', 'DIST_TO_SECTOR_ZONE sector must be 1..9')

      const z = evalInt(node.arguments[1], ctx)
      if (!z.ok) return z
      if (z.value < 1 || z.value > 4) return err('RANGE', 'DIST_TO_SECTOR_ZONE zone must be 1..4')

      const d = resolveDistToSectorZone(ctx, s.value, z.value)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_SECTOR_ZONE not available in ctx')
      return ok(d)
    }

    if (fn === 'DIST_TO_CLOSEST_POWERUP') {
      if (node.arguments.length !== 1) return err('ARITY', 'DIST_TO_CLOSEST_POWERUP expects 1 argument')
      const type = evalTokenArg(node.arguments[0])
      if (!type.ok) return type
      if (
        type.value !== 'ANY' &&
        type.value !== 'HEALTH' &&
        type.value !== 'AMMO' &&
        type.value !== 'ENERGY'
      ) {
        return err('BAD_TOKEN', `Invalid powerup type token: ${type.value}`)
      }
      const d = resolveDistToClosestPowerup(ctx, type.value)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_CLOSEST_POWERUP not available in ctx')
      return ok(d)
    }

    if (fn === 'ENEMIES_IN_RANGE') {
      if (node.arguments.length !== 1) return err('ARITY', 'ENEMIES_IN_RANGE expects 1 argument')
      const n = evalInt(node.arguments[0], ctx)
      if (!n.ok) return n
      const v = resolveEnemiesInRange(ctx, n.value)
      if (!isInt(v)) return err('MISSING', 'ENEMIES_IN_RANGE not available in ctx')
      return ok(v)
    }

    if (fn === 'COUNT_ALIVE_ENEMIES') {
      if (node.arguments.length !== 0) return err('ARITY', 'COUNT_ALIVE_ENEMIES expects 0 arguments')
      const v = resolveCountAliveEnemies(ctx)
      if (!isInt(v)) return err('MISSING', 'COUNT_ALIVE_ENEMIES not available in ctx')
      return ok(v)
    }

    if (fn === 'LOWEST_HEALTH_ENEMY_IN_RANGE') {
      if (node.arguments.length !== 1) return err('ARITY', 'LOWEST_HEALTH_ENEMY_IN_RANGE expects 1 argument')
      const n = evalInt(node.arguments[0], ctx)
      if (!n.ok) return n
      const v = resolveLowestHealthEnemyInRange(ctx, n.value)
      if (!isInt(v)) return err('MISSING', 'LOWEST_HEALTH_ENEMY_IN_RANGE not available in ctx')
      return ok(v)
    }

    if (fn === 'HAS_TARGET_POWERUP') {
      if (node.arguments.length !== 0) return err('ARITY', 'HAS_TARGET_POWERUP expects 0 arguments')
      const v = resolveBoolish(ctx?.hasTargetPowerup)
      if (v == null) return err('MISSING', 'HAS_TARGET_POWERUP not available in ctx')
      return ok(v)
    }

    if (
      fn === 'POWERUP_IN_SECTOR' ||
      fn === 'POWERUP_IN_SECTOR_CENTER' ||
      fn === 'POWERUP_IN_ZONE' ||
      fn === 'POWERUP_IN_SAME_SECTOR' ||
      fn === 'POWERUP_IN_SAME_ZONE'
    ) {
      // Token args: TYPE plus optional sector/zone ints.
      const type = evalTokenArg(node.arguments[0])
      if (!type.ok) return type

      const selfSector = resolveIntish(ctx?.sector)
      const selfZone = resolveIntish(ctx?.zone)

      if (fn === 'POWERUP_IN_SAME_SECTOR') {
        if (node.arguments.length !== 1) return err('ARITY', 'POWERUP_IN_SAME_SECTOR expects 1 argument')
        if (selfSector == null) return err('MISSING', 'SECTOR not available in ctx')
        return ok(Boolean(resolvePowerupInSector(ctx, type.value, selfSector, null)))
      }

      if (fn === 'POWERUP_IN_SAME_ZONE') {
        if (node.arguments.length !== 1) return err('ARITY', 'POWERUP_IN_SAME_ZONE expects 1 argument')
        if (selfSector == null || selfZone == null) return err('MISSING', 'SECTOR/ZONE not available in ctx')
        return ok(Boolean(resolvePowerupInZone(ctx, type.value, selfSector, selfZone)))
      }

      if (fn === 'POWERUP_IN_SECTOR') {
        if (node.arguments.length !== 2) return err('ARITY', 'POWERUP_IN_SECTOR expects 2 arguments')
        const s = evalInt(node.arguments[1], ctx)
        if (!s.ok) return s
        if (s.value < 1 || s.value > 9) return err('RANGE', 'POWERUP_IN_SECTOR sector must be 1..9')
        return ok(Boolean(resolvePowerupInSector(ctx, type.value, s.value, null)))
      }

      if (fn === 'POWERUP_IN_SECTOR_CENTER') {
        if (node.arguments.length !== 2) return err('ARITY', 'POWERUP_IN_SECTOR_CENTER expects 2 arguments')
        const s = evalInt(node.arguments[1], ctx)
        if (!s.ok) return s
        if (s.value < 1 || s.value > 9) return err('RANGE', 'POWERUP_IN_SECTOR_CENTER sector must be 1..9')
        return ok(Boolean(resolvePowerupInSectorCenter(ctx, type.value, s.value)))
      }

      // POWERUP_IN_ZONE
      if (node.arguments.length !== 3) return err('ARITY', 'POWERUP_IN_ZONE expects 3 arguments')
      const s = evalInt(node.arguments[1], ctx)
      if (!s.ok) return s
      if (s.value < 1 || s.value > 9) return err('RANGE', 'POWERUP_IN_ZONE sector must be 1..9')

      const z = evalInt(node.arguments[2], ctx)
      if (!z.ok) return z
      if (z.value < 1 || z.value > 4) return err('RANGE', 'POWERUP_IN_ZONE zone must be 1..4')

      return ok(Boolean(resolvePowerupInZone(ctx, type.value, s.value, z.value)))
    }

    if (fn === 'DIST_TO_ARENA_EDGE' || fn === 'DIST_TO_WALL') {
      if (node.arguments.length !== 1) return err('ARITY', `${fn} expects 1 argument`)
      const dirTok = evalTokenArg(node.arguments[0])
      if (!dirTok.ok) return dirTok
      const dir = parseWallDirToken(dirTok.value)
      if (!dir) return err('BAD_TOKEN', `Invalid dir token: ${dirTok.value}`)
      const d = resolveDistToArenaEdge(ctx, dir)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_ARENA_EDGE not available in ctx')
      return ok(d)
    }

    if (fn === 'BUMPED_WALL') {
      if (node.arguments.length !== 0) return err('ARITY', 'BUMPED_WALL expects 0 arguments')
      const v = resolveBoolish(ctx?.bumpedWall)
      if (v == null) return err('MISSING', 'BUMPED_WALL not available in ctx')
      return ok(v)
    }

    if (fn === 'BUMPED_WALL_DIR') {
      if (node.arguments.length !== 1) return err('ARITY', 'BUMPED_WALL_DIR expects 1 argument')
      const dirTok = evalTokenArg(node.arguments[0])
      if (!dirTok.ok) return dirTok
      const dir = parseMoveDirToken(dirTok.value)
      if (!dir) return err('BAD_TOKEN', `Invalid dir token: ${dirTok.value}`)
      const bumped = resolveBoolish(ctx?.bumpedWall)
      const bumpedDir = resolveStringish(ctx?.bumpedWallDir)
      if (bumped == null || bumpedDir == null) return err('MISSING', 'BUMPED_WALL_DIR not available in ctx')
      return ok(Boolean(bumped && bumpedDir === dir))
    }

    if (fn === 'BUMPED_BOT_IS') {
      if (node.arguments.length !== 1) return err('ARITY', 'BUMPED_BOT_IS expects 1 argument')
      const botTok = evalTokenArg(node.arguments[0])
      if (!botTok.ok) return botTok
      const bumped = resolveBoolish(ctx?.bumpedBot)
      const otherId = resolveStringish(ctx?.bumpedBotId)
      if (bumped == null || otherId == null) return err('MISSING', 'BUMPED_BOT_IS not available in ctx')
      return ok(Boolean(bumped && otherId === botTok.value))
    }

    if (fn === 'BUMPED_BOT_DIR') {
      if (node.arguments.length !== 1) return err('ARITY', 'BUMPED_BOT_DIR expects 1 argument')
      const dirTok = evalTokenArg(node.arguments[0])
      if (!dirTok.ok) return dirTok
      const dir = parseMoveDirToken(dirTok.value)
      if (!dir) return err('BAD_TOKEN', `Invalid dir token: ${dirTok.value}`)
      const bumped = resolveBoolish(ctx?.bumpedBot)
      const bumpedDir = resolveStringish(ctx?.bumpedBotDir)
      if (bumped == null || bumpedDir == null) return err('MISSING', 'BUMPED_BOT_DIR not available in ctx')
      return ok(Boolean(bumped && bumpedDir === dir))
    }

    if (fn === 'HAS_MODULE') {
      if (node.arguments.length !== 1) return err('ARITY', 'HAS_MODULE expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      const v = resolveHasModule(ctx, slot)
      if (v == null) return err('MISSING', 'HAS_MODULE not available in ctx')
      return ok(Boolean(v))
    }

    if (fn === 'COOLDOWN_REMAINING') {
      if (node.arguments.length !== 1) return err('ARITY', 'COOLDOWN_REMAINING expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      const v = resolveCooldownRemaining(ctx, slot)
      if (!isInt(v)) return err('MISSING', 'COOLDOWN_REMAINING not available in ctx')
      return ok(v)
    }

    if (fn === 'SLOT_READY') {
      if (node.arguments.length !== 1) return err('ARITY', 'SLOT_READY expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      return ok(Boolean(resolveSlotReady(ctx, slot)))
    }

    if (fn === 'SLOT_ACTIVE') {
      if (node.arguments.length !== 1) return err('ARITY', 'SLOT_ACTIVE expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      return ok(Boolean(resolveSlotActive(ctx, slot)))
    }

    if (fn === 'TIMER_REMAINING' || fn === 'TIMER_ACTIVE' || fn === 'TIMER_DONE') {
      if (node.arguments.length !== 1) return err('ARITY', `${fn} expects 1 argument`)
      const timerTok = evalTokenArg(node.arguments[0])
      if (!timerTok.ok) return timerTok
      const timer = parseTimerToken(timerTok.value)
      if (!timer) return err('BAD_TOKEN', `Invalid timer token: ${timerTok.value}`)

      const remaining = resolveTimerRemaining(ctx, timer)
      if (!isInt(remaining)) return err('MISSING', `Unknown timer: ${timerTok.value}`)

      if (fn === 'TIMER_REMAINING') return ok(remaining)
      if (fn === 'TIMER_ACTIVE') return ok(remaining > 0)
      return ok(remaining === 0)
    }

    if (fn === 'HAS_TARGET_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'HAS_TARGET_BOT expects 0 arguments')
      const v = resolveBoolish(ctx?.hasTargetBot)
      if (v == null) return err('MISSING', 'HAS_TARGET_BOT not available in ctx')
      return ok(v)
    }

    if (fn === 'HAS_TARGET_BULLET') {
      if (node.arguments.length !== 0) return err('ARITY', 'HAS_TARGET_BULLET expects 0 arguments')
      const v = resolveBoolish(/** @type {any} */ (ctx)?.hasTargetBullet)
      if (v == null) return err('MISSING', 'HAS_TARGET_BULLET not available in ctx')
      return ok(v)
    }

    if (fn === 'BUMPED_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'BUMPED_BOT expects 0 arguments')
      const v = resolveBoolish(ctx?.bumpedBot)
      if (v == null) return err('MISSING', 'BUMPED_BOT not available in ctx')
      return ok(v)
    }

    if (fn === 'BULLET_IN_SAME_SECTOR') {
      if (node.arguments.length !== 0) return err('ARITY', 'BULLET_IN_SAME_SECTOR expects 0 arguments')
      const v = resolveBoolish(ctx?.bulletInSameSector)
      if (v == null) return err('MISSING', 'BULLET_IN_SAME_SECTOR not available in ctx')
      return ok(v)
    }

    if (fn === 'BULLET_IN_ADJ_SECTOR') {
      if (node.arguments.length !== 0) return err('ARITY', 'BULLET_IN_ADJ_SECTOR expects 0 arguments')
      const v = resolveBoolish(ctx?.bulletInAdjSector)
      if (v == null) return err('MISSING', 'BULLET_IN_ADJ_SECTOR not available in ctx')
      return ok(v)
    }

    // Fallback for future pure helpers.
    const impl = resolveFunction(ctx, fn)
    if (!impl) return err('UNKNOWN_FUNCTION', `Unknown function: ${fn}`)

    /** @type {(number|boolean)[]} */
    const args = []
    for (const a of node.arguments) {
      const r = evalNode(a, ctx)
      if (!r.ok) return r
      args.push(r.value)
    }

    const v = impl(...args)
    if (typeof v === 'boolean') return ok(v)
    if (isInt(v)) return ok(v)

    return err('TYPE_ERROR', `Function ${fn} returned invalid value: ${String(v)}`)
  }

  return err('UNKNOWN_NODE', `Unknown expression node type: ${/** @type {any} */ (node).type}`)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {{ ok: true, value: number } | { ok: false, error: { code: string, message: string } }}
 */
function evalInt(node, ctx) {
  const r = evalNode(node, ctx)
  if (!r.ok) return r
  if (!isInt(r.value)) return err('TYPE_ERROR', 'Expected int')
  return /** @type {any} */ (r)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {{ ok: true, value: boolean } | { ok: false, error: { code: string, message: string } }}
 */
function evalBool(node, ctx) {
  const r = evalNode(node, ctx)
  if (!r.ok) return r
  if (typeof r.value === 'boolean') return /** @type {any} */ (r)
  if (isInt(r.value)) return ok(r.value !== 0)
  return err('TYPE_ERROR', 'Expected bool')
}

/**
 * Some built-in functions take symbolic tokens (`BOT1`, `HEALTH`, `T1`, `SLOT1`)
 * rather than evaluating the identifier value.
 *
 * @param {Expr | undefined} node
 * @returns {{ ok: true, value: string } | { ok: false, error: { code: string, message: string } }}
 */
function evalTokenArg(node) {
  if (!node) return err('ARITY', 'Missing argument')
  if (node.type !== 'Identifier') return err('TYPE_ERROR', 'Expected identifier token argument')
  return { ok: true, value: node.name.toUpperCase() }
}

/** @param {unknown} v */
function resolveBoolish(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'function') {
    const r = v()
    if (typeof r === 'boolean') return r
  }
  return null
}

/** @param {unknown} v */
function resolveIntish(v) {
  if (isInt(v)) return v
  if (typeof v === 'function') {
    const r = v()
    if (isInt(r)) return r
  }
  return null
}

/** @param {unknown} v */
function resolveStringish(v) {
  if (typeof v === 'string') return v.toUpperCase()
  if (typeof v === 'function') {
    const r = v()
    if (typeof r === 'string') return r.toUpperCase()
  }
  return null
}

/**
 * @param {string} s
 * @returns {'UP'|'DOWN'|'LEFT'|'RIGHT'|'UP_LEFT'|'UP_RIGHT'|'DOWN_LEFT'|'DOWN_RIGHT'|null}
 */
function parseMoveDirToken(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'UP' || t === 'DOWN' || t === 'LEFT' || t === 'RIGHT') return t
  if (t === 'UP_LEFT' || t === 'UP_RIGHT' || t === 'DOWN_LEFT' || t === 'DOWN_RIGHT') return t
  return null
}

/**
 * @param {string} s
 * @returns {'UP'|'DOWN'|'LEFT'|'RIGHT'|null}
 */
function parseWallDirToken(s) {
  const t = (s ?? '').toUpperCase()
  if (t === 'UP' || t === 'DOWN' || t === 'LEFT' || t === 'RIGHT') return t
  return null
}

/**
 * Sector adjacency in the 3x3 sector grid.
 * @param {number} a
 * @param {number} b
 */
function isAdjSector(a, b) {
  if (!isInt(a) || !isInt(b)) return false
  if (a === b) return false

  const ax = ((a - 1) % 3) + 1
  const ay = Math.floor((a - 1) / 3) + 1
  const bx = ((b - 1) % 3) + 1
  const by = Math.floor((b - 1) / 3) + 1

  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1
}

/**
 * @param {EvalCtx} ctx
 * @param {string} name
 */
function resolveIdentifier(ctx, name) {
  if (typeof ctx?.getVar === 'function') {
    const v = ctx.getVar(name)
    if (v !== undefined) return v
  }

  if (ctx && typeof ctx === 'object') {
    if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name]
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return /** @type {any} */ (ctx)[name]
  }

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} name
 */
function resolveFunction(ctx, name) {
  if (ctx && typeof ctx === 'object') {
    if (ctx.functions && typeof ctx.functions[name] === 'function') return ctx.functions[name]
    if (typeof /** @type {any} */ (ctx)[name] === 'function') return /** @type {any} */ (ctx)[name]
  }

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 */
function resolvePowerupExists(ctx, type) {
  const t = /** @type {'HEALTH'|'AMMO'|'ENERGY'} */ (type)

  if (typeof ctx?.powerupExists === 'function') return ctx.powerupExists(t)

  const p = ctx?.powerups
  if (!p) return null

  if (typeof p === 'function') return p(type)
  if (typeof p.has === 'function') return p.has(type)
  if (typeof p === 'object') return Boolean(/** @type {any} */ (p)[type])

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} bot
 */
function resolveBotAlive(ctx, bot) {
  const b = /** @type {'BOT1'|'BOT2'|'BOT3'|'BOT4'} */ (bot)

  if (typeof ctx?.botAlive === 'function') return ctx.botAlive(b)

  const a = ctx?.botsAlive
  if (!a) return null

  if (typeof a === 'function') return a(b)
  if (typeof a === 'object') return Boolean(/** @type {any} */ (a)[b])

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} timer
 */
function resolveTimerRemaining(ctx, timer) {
  if (typeof ctx?.timerRemaining === 'function') return ctx.timerRemaining(timer)

  const timers = ctx?.timers
  if (!timers) return null

  if (typeof timers === 'function') return timers(timer)

  if (typeof timers === 'object') {
    const key = `T${timer}`
    const v = /** @type {any} */ (timers)[key]
    return v
  }

  return null
}

/** @param {EvalCtx} ctx */
function resolveDistToClosestBot(ctx) {
  const v = ctx?.distToClosestBot
  if (typeof v === 'function') return v()
  return v
}

/**
 * @param {EvalCtx} ctx
 * @param {string} botId
 */
function resolveBotSector(ctx, botId) {
  const b = /** @type {'BOT1'|'BOT2'|'BOT3'|'BOT4'} */ (botId)

  if (typeof /** @type {any} */ (ctx)?.botSector === 'function') {
    return /** @type {any} */ (ctx).botSector(b)
  }

  const m = /** @type {any} */ (ctx)?.botSectors
  if (m && typeof m === 'object') return m[b]

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} botId
 */
function resolveDistToBot(ctx, botId) {
  const b = /** @type {'BOT1'|'BOT2'|'BOT3'|'BOT4'} */ (botId)

  if (typeof /** @type {any} */ (ctx)?.distToBot === 'function') {
    return /** @type {any} */ (ctx).distToBot(b)
  }

  const m = /** @type {any} */ (ctx)?.distsToBot
  if (m && typeof m === 'object') return m[b]

  return null
}

/** @param {EvalCtx} ctx */
function resolveDistToTargetBot(ctx) {
  const v = /** @type {any} */ (ctx)?.distToTargetBot
  if (typeof v === 'function') return v()
  return v
}

/** @param {EvalCtx} ctx */
function resolveDistToTargetBullet(ctx) {
  const v = /** @type {any} */ (ctx)?.distToTargetBullet
  if (typeof v === 'function') return v()
  return v
}

/**
 * @param {EvalCtx} ctx
 * @param {number} sector
 */
function resolveDistToSector(ctx, sector) {
  const v = /** @type {any} */ (ctx)?.distToSector
  if (typeof v === 'function') return v(sector)
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {number} sector
 * @param {number} zone
 */
function resolveDistToSectorZone(ctx, sector, zone) {
  const v = /** @type {any} */ (ctx)?.distToSectorZone
  if (typeof v === 'function') return v(sector, zone)
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 */
function resolveDistToClosestPowerup(ctx, type) {
  const t = type === 'ANY' ? null : /** @type {'HEALTH'|'AMMO'|'ENERGY'} */ (type)
  const v = /** @type {any} */ (ctx)?.distToClosestPowerup
  if (typeof v === 'function') return v(t)
  return null
}

/**
 * @param {EvalCtx} ctx
 */
function resolveCountAliveEnemies(ctx) {
  const v = /** @type {any} */ (ctx)?.countAliveEnemies
  if (typeof v === 'function') return v()
  if (isInt(v)) return v

  const alive = ctx?.botsAlive
  if (alive && typeof alive === 'object') {
    let count = 0
    for (const botId of ['BOT1', 'BOT2', 'BOT3', 'BOT4']) {
      if (alive[botId]) count++
    }
    return count
  }

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {number} n
 */
function resolveEnemiesInRange(ctx, n) {
  const v = /** @type {any} */ (ctx)?.enemiesInRange
  if (typeof v === 'function') return v(n)
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {number} n
 */
function resolveLowestHealthEnemyInRange(ctx, n) {
  const v = /** @type {any} */ (ctx)?.lowestHealthEnemyInRange
  if (typeof v === 'function') return v(n)
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 * @param {number} sector
 * @param {number|null} zoneOrNull If null, checks any zone (including center)
 */
function resolvePowerupInSector(ctx, type, sector, zoneOrNull) {
  const t = /** @type {'HEALTH'|'AMMO'|'ENERGY'} */ (type)
  const v = /** @type {any} */ (ctx)?.powerupInSector
  if (typeof v === 'function') return v(t, sector, zoneOrNull)
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 * @param {number} sector
 */
function resolvePowerupInSectorCenter(ctx, type, sector) {
  return resolvePowerupInSector(ctx, type, sector, 0)
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 * @param {number} sector
 * @param {number} zone
 */
function resolvePowerupInZone(ctx, type, sector, zone) {
  return resolvePowerupInSector(ctx, type, sector, zone)
}

/**
 * @param {EvalCtx} ctx
 * @param {'UP'|'DOWN'|'LEFT'|'RIGHT'} dir
 */
function resolveDistToArenaEdge(ctx, dir) {
  const v = /** @type {any} */ (ctx)?.distToArenaEdge
  if (typeof v === 'function') return v(dir)
  if (v && typeof v === 'object') return v[dir]
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveHasModule(ctx, slot) {
  const v = /** @type {any} */ (ctx)?.hasModule
  if (typeof v === 'function') return v(slot)
  if (v && typeof v === 'object') return v[`SLOT${slot}`] ?? v[slot]
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveCooldownRemaining(ctx, slot) {
  const v = /** @type {any} */ (ctx)?.cooldownRemaining
  if (typeof v === 'function') return v(slot)
  if (v && typeof v === 'object') return v[`SLOT${slot}`] ?? v[slot]
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveSlotReady(ctx, slot) {
  const sr = ctx?.slotReady
  if (!sr) return null
  if (typeof sr === 'function') return sr(slot)
  if (typeof sr === 'object') return Boolean(/** @type {any} */ (sr)[`SLOT${slot}`] ?? /** @type {any} */ (sr)[slot])
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveSlotActive(ctx, slot) {
  const sa = ctx?.slotActive
  if (!sa) return null
  if (typeof sa === 'function') return sa(slot)
  if (typeof sa === 'object') return Boolean(/** @type {any} */ (sa)[`SLOT${slot}`] ?? /** @type {any} */ (sa)[slot])
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3|4} zone
 */
function resolveInZone(ctx, zone) {
  if (typeof ctx?.inZone === 'function') return ctx.inZone(zone)
  if (isInt(ctx?.zone)) return ctx.zone === zone
  return null
}

/**
 * @param {string} s
 * @returns {1|2|3|0}
 */
function parseSlotToken(s) {
  if (s === 'SLOT1') return 1
  if (s === 'SLOT2') return 2
  if (s === 'SLOT3') return 3
  return 0
}

/**
 * @param {string} s
 * @returns {1|2|3|0}
 */
function parseTimerToken(s) {
  if (s === 'T1') return 1
  if (s === 'T2') return 2
  if (s === 'T3') return 3
  return 0
}
