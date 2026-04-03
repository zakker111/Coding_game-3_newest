/**
 * @typedef {{ offset: number, line: number, column: number }} SourcePos
 */

/**
 * @typedef {{ start: SourcePos, end: SourcePos }} SourceLoc
 */

/**
 * Compiler-facing error with optional source location.
 */
export class BotCompileError extends Error {
  /**
   * @param {string} message
   * @param {SourceLoc | SourcePos | null | undefined} [loc]
   */
  constructor(message, loc) {
    const pos = loc && 'start' in loc ? loc.start : loc
    const prefix = pos ? `[${pos.line}:${pos.column}] ` : ''

    super(prefix + message)

    this.name = 'BotCompileError'

    /** @type {SourceLoc | null} */
    this.loc = loc
      ? 'start' in loc
        ? loc
        : { start: loc, end: loc }
      : null
  }
}

/**
 * @param {string} message
 * @param {SourceLoc | SourcePos | null | undefined} [loc]
 */
export function botCompileError(message, loc) {
  return new BotCompileError(message, loc)
}
