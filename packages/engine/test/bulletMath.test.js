import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeToLen } from '../src/sim/arenaMath.js'

test('normalizeToLen: axis-aligned vectors normalize to exact speed', () => {
  assert.deepStrictEqual(normalizeToLen(10, 0, 10), { x: 10, y: 0 })
  assert.deepStrictEqual(normalizeToLen(-10, 0, 10), { x: -10, y: 0 })
  assert.deepStrictEqual(normalizeToLen(0, 10, 10), { x: 0, y: 10 })
  assert.deepStrictEqual(normalizeToLen(0, -10, 10), { x: 0, y: -10 })
})

test('normalizeToLen: diagonal vector does not overspeed', () => {
  const v = normalizeToLen(1, 1, 10)
  // Expect near 7,7 rather than 10,10 (which would be L∞ normalization).
  assert.deepStrictEqual(v, { x: 7, y: 7 })
  assert.ok(v.x * v.x + v.y * v.y <= 100)
})

test('normalizeToLen: 3-4-5 triangle scales correctly', () => {
  const v = normalizeToLen(3, 4, 10)
  assert.deepStrictEqual(v, { x: 6, y: 8 })
  assert.equal(v.x * v.x + v.y * v.y, 100)
})
