import test from 'node:test'
import assert from 'node:assert/strict'

import { parseExpression } from '../src/dsl/expr.js'

function op(expr) {
  assert.equal(expr.type, 'BinaryExpression')
  return expr.operator
}

test('parseExpression: operator precedence (&& binds tighter than ||)', () => {
  const expr = parseExpression('1 == 2 || 3 == 3 && 0 == 1')

  assert.equal(expr.type, 'BinaryExpression')
  assert.equal(expr.operator, '||')

  assert.equal(expr.right.type, 'BinaryExpression')
  assert.equal(expr.right.operator, '&&')
})

test('parseExpression: parentheses override precedence', () => {
  const expr = parseExpression('(1 == 2 || 3 == 3) && 0 == 1')

  assert.equal(expr.type, 'BinaryExpression')
  assert.equal(expr.operator, '&&')

  assert.equal(expr.left.type, 'BinaryExpression')
  assert.equal(expr.left.operator, '||')
})

test('parseExpression: unary ! binds to the following expression', () => {
  const expr = parseExpression('!BOT_ALIVE(BOT1)')

  assert.equal(expr.type, 'UnaryExpression')
  assert.equal(expr.operator, '!')

  assert.equal(expr.argument.type, 'CallExpression')
  assert.equal(expr.argument.callee.name, 'BOT_ALIVE')
  assert.equal(expr.argument.arguments.length, 1)
  assert.equal(expr.argument.arguments[0].type, 'Identifier')
  assert.equal(expr.argument.arguments[0].name, 'BOT1')
})

test('parseExpression: function calls with multiple args', () => {
  const expr = parseExpression('DIST_TO_SECTOR_ZONE(5, 4) <= 10')

  assert.equal(expr.type, 'BinaryExpression')
  assert.equal(op(expr), '<=')

  assert.equal(expr.left.type, 'CallExpression')
  assert.equal(expr.left.callee.name, 'DIST_TO_SECTOR_ZONE')
  assert.equal(expr.left.arguments.length, 2)
  assert.deepStrictEqual(
    expr.left.arguments.map((a) => (a.type === 'IntLiteral' ? a.value : null)),
    [5, 4]
  )

  assert.equal(expr.right.type, 'IntLiteral')
  assert.equal(expr.right.value, 10)
})

test('parseExpression: errors on malformed input', () => {
  assert.throws(() => parseExpression('HEALTH <'), /Unexpected token/i)
})
