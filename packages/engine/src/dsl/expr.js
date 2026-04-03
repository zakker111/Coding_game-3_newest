import { BotCompileError } from './BotCompileError.js'
import { tokenize } from './tokenize.js'

/**
 * @typedef {{ offset: number, line: number, column: number }} SourcePos
 */

/**
 * @typedef {{ start: SourcePos, end: SourcePos }} SourceLoc
 */

/**
 * @typedef {import('./tokenize.js').Token} Token
 */

/**
 * @typedef {(
 *   | { type: 'IntLiteral', value: number, loc: SourceLoc }
 *   | { type: 'Identifier', name: string, loc: SourceLoc }
 *   | { type: 'CallExpression', callee: { type: 'Identifier', name: string, loc: SourceLoc }, arguments: Expr[], loc: SourceLoc }
 *   | { type: 'UnaryExpression', operator: '!', argument: Expr, loc: SourceLoc }
 *   | { type: 'BinaryExpression', operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||', left: Expr, right: Expr, loc: SourceLoc }
 * )} Expr
 */

const comparisonOps = new Set(['==', '!=', '<', '<=', '>', '>='])
const andOp = '&&'
const orOp = '||'

class Parser {
  /**
   * @param {Token[]} tokens
   * @param {number} index
   */
  constructor(tokens, index) {
    this.tokens = tokens
    this.i = index
  }

  /** @returns {Token} */
  peek() {
    return this.tokens[this.i]
  }

  /** @returns {Token} */
  prev() {
    return this.tokens[this.i - 1]
  }

  /**
   * @param {string} message
   * @param {Token | null | undefined} [token]
   */
  error(message, token) {
    const t = token ?? this.peek()
    return new BotCompileError(message, t.loc.start)
  }

  /**
   * @param {Token['kind']} kind
   * @param {string | null | undefined} [text]
   */
  expect(kind, text) {
    const t = this.peek()
    if (t.kind !== kind) {
      throw this.error(`Expected ${kind} but found ${t.kind}`, t)
    }
    if (text != null && t.text !== text) {
      throw this.error(`Expected ${JSON.stringify(text)} but found ${JSON.stringify(t.text)}`, t)
    }
    this.i++
    return t
  }

  /**
   * @param {Token['kind']} kind
   * @param {string | null | undefined} [text]
   */
  match(kind, text) {
    const t = this.peek()
    if (t.kind !== kind) return null
    if (text != null && t.text !== text) return null
    this.i++
    return t
  }

  /** @returns {{ expr: Expr, nextIndex: number }} */
  parseExpression() {
    const expr = this.parseOr()
    return { expr, nextIndex: this.i }
  }

  /** @returns {Expr} */
  parseOr() {
    let left = this.parseAnd()

    while (this.match('OP', orOp)) {
      const opToken = this.prev()
      const right = this.parseAnd()
      left = {
        type: 'BinaryExpression',
        operator: /** @type {'||'} */ (opToken.text),
        left,
        right,
        loc: { start: left.loc.start, end: right.loc.end },
      }
    }

    return left
  }

  /** @returns {Expr} */
  parseAnd() {
    let left = this.parseCompare()

    while (this.match('OP', andOp)) {
      const opToken = this.prev()
      const right = this.parseCompare()
      left = {
        type: 'BinaryExpression',
        operator: /** @type {'&&'} */ (opToken.text),
        left,
        right,
        loc: { start: left.loc.start, end: right.loc.end },
      }
    }

    return left
  }

  /** @returns {Expr} */
  parseCompare() {
    let left = this.parseUnary()

    while (this.peek().kind === 'OP' && comparisonOps.has(this.peek().text)) {
      const opToken = this.peek()
      this.i++
      const right = this.parseUnary()
      left = {
        type: 'BinaryExpression',
        operator: /** @type {Expr & { type: 'BinaryExpression' }['operator']} */ (opToken.text),
        left,
        right,
        loc: { start: left.loc.start, end: right.loc.end },
      }
    }

    return left
  }

  /** @returns {Expr} */
  parseUnary() {
    if (this.match('OP', '!')) {
      const opToken = this.prev()
      const argument = this.parseUnary()
      return {
        type: 'UnaryExpression',
        operator: '!',
        argument,
        loc: { start: opToken.loc.start, end: argument.loc.end },
      }
    }

    return this.parsePrimary()
  }

  /** @returns {Expr} */
  parsePrimary() {
    const t = this.peek()

    if (t.kind === 'INT') {
      this.i++
      return {
        type: 'IntLiteral',
        value: t.value ?? Number.parseInt(t.text, 10),
        loc: t.loc,
      }
    }

    if (t.kind === 'IDENT') {
      this.i++
      /** @type {{ type: 'Identifier', name: string, loc: SourceLoc }} */
      const ident = { type: 'Identifier', name: t.text, loc: t.loc }

      if (!this.match('LPAREN')) {
        return ident
      }

      /** @type {Expr[]} */
      const args = []

      if (!this.match('RPAREN')) {
        while (true) {
          const { expr } = this.parseExpression()
          args.push(expr)

          if (this.match('COMMA')) continue

          this.expect('RPAREN')
          break
        }
      }

      const end = this.prev().loc.end

      return {
        type: 'CallExpression',
        callee: ident,
        arguments: args,
        loc: { start: ident.loc.start, end },
      }
    }

    if (this.match('LPAREN')) {
      const lparen = this.prev()
      const { expr } = this.parseExpression()
      const rparen = this.expect('RPAREN')
      return {
        ...expr,
        loc: { start: lparen.loc.start, end: rparen.loc.end },
      }
    }

    throw this.error(`Unexpected token: ${t.kind}${t.text ? ` (${JSON.stringify(t.text)})` : ''}`, t)
  }
}

/**
 * Parse an expression from an already tokenized stream.
 *
 * @param {Token[]} tokens
 * @param {number} [startIndex]
 * @returns {{ expr: Expr, nextIndex: number }}
 */
export function parseExpressionFromTokens(tokens, startIndex = 0) {
  const p = new Parser(tokens, startIndex)
  return p.parseExpression()
}

/**
 * Parse a full expression string.
 *
 * @param {string} sourceText
 * @returns {Expr}
 */
export function parseExpression(sourceText) {
  const tokens = tokenize(sourceText)
  const { expr, nextIndex } = parseExpressionFromTokens(tokens, 0)
  const t = tokens[nextIndex]
  if (t.kind !== 'EOF') {
    throw new BotCompileError(`Unexpected token after expression: ${t.kind} (${JSON.stringify(t.text)})`, t.loc.start)
  }
  return expr
}
