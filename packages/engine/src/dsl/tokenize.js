import { BotCompileError } from './BotCompileError.js'

/**
 * @typedef {'IDENT' | 'INT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF'} TokenKind
 */

/**
 * @typedef {{ offset: number, line: number, column: number }} SourcePos
 */

/**
 * @typedef {{ start: SourcePos, end: SourcePos }} SourceLoc
 */

/**
 * @typedef {{
 *   kind: TokenKind,
 *   text: string,
 *   loc: SourceLoc,
 *   value?: number,
 * }} Token
 */

const twoCharOps = new Set(['==', '!=', '<=', '>=', '&&', '||'])
const oneCharOps = new Set(['<', '>', '!'])

/**
 * @param {string} ch
 */
function isIdentStart(ch) {
  const c = ch.codePointAt(0)
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || ch === '_'
}

/**
 * @param {string} ch
 */
function isIdentContinue(ch) {
  const c = ch.codePointAt(0)
  return isIdentStart(ch) || (c >= 48 && c <= 57)
}

/**
 * @param {string} ch
 */
function isDigit(ch) {
  const c = ch.codePointAt(0)
  return c >= 48 && c <= 57
}

/**
 * Tokenize a DSL source fragment.
 *
 * Suitable for both instruction parsing (keywords/idents) and expressions.
 *
 * @param {string} sourceText
 * @returns {Token[]}
 */
export function tokenize(sourceText) {
  /** @type {Token[]} */
  const tokens = []

  let i = 0
  let line = 1
  let column = 1

  /**
   * @returns {SourcePos}
   */
  function pos() {
    return { offset: i, line, column }
  }

  /**
   * @param {number} n
   */
  function advance(n) {
    for (let j = 0; j < n; j++) {
      const ch = sourceText[i]
      if (ch === '\n') {
        i++
        line++
        column = 1
        continue
      }

      if (ch === '\r') {
        // Treat CR or CRLF as a single newline.
        if (sourceText[i + 1] === '\n') i++
        i++
        line++
        column = 1
        continue
      }

      i++
      column++
    }
  }

  /**
   * @param {TokenKind} kind
   * @param {string} text
   * @param {SourcePos} start
   * @param {SourcePos} end
   * @param {number | undefined} [value]
   */
  function push(kind, text, start, end, value) {
    /** @type {Token} */
    const t = { kind, text, loc: { start, end } }
    if (value !== undefined) t.value = value
    tokens.push(t)
  }

  while (i < sourceText.length) {
    const ch = sourceText[i]

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      advance(1)
      continue
    }

    const start = pos()

    // identifiers
    if (isIdentStart(ch)) {
      let text = ch
      advance(1)
      while (i < sourceText.length && isIdentContinue(sourceText[i])) {
        text += sourceText[i]
        advance(1)
      }
      push('IDENT', text, start, pos())
      continue
    }

    // integers
    if (isDigit(ch)) {
      let text = ch
      advance(1)
      while (i < sourceText.length && isDigit(sourceText[i])) {
        text += sourceText[i]
        advance(1)
      }

      // Avoid Number() parsing quirks for huge ints; we only need deterministic behavior.
      const value = Number.parseInt(text, 10)
      push('INT', text, start, pos(), value)
      continue
    }

    // punctuation
    if (ch === '(') {
      advance(1)
      push('LPAREN', '(', start, pos())
      continue
    }
    if (ch === ')') {
      advance(1)
      push('RPAREN', ')', start, pos())
      continue
    }
    if (ch === ',') {
      advance(1)
      push('COMMA', ',', start, pos())
      continue
    }

    // operators (check two-char first)
    const two = sourceText.slice(i, i + 2)
    if (twoCharOps.has(two)) {
      advance(2)
      push('OP', two, start, pos())
      continue
    }
    if (oneCharOps.has(ch)) {
      advance(1)
      push('OP', ch, start, pos())
      continue
    }

    throw new BotCompileError(`Unexpected character: ${JSON.stringify(ch)}`, start)
  }

  const end = pos()
  push('EOF', '', end, end)

  return tokens
}
