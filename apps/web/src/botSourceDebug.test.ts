import { expect, it } from 'vitest'

import { compileBotSource } from '@coding-game/engine'

import { getLineRangeForLine, getSourceLineForPc, getSourceLineText, getSourceLines } from './botSourceDebug'

it('maps compiled pc values back to source lines', () => {
  const sourceText = [';@slot1 BULLET', ';@slot2 EMPTY', ';@slot3 EMPTY', 'MOVE UP', 'WAIT', 'SHOOT'].join('\n')

  const compiled = compileBotSource(sourceText)

  expect(getSourceLineForPc(compiled.program.pcToSourceLine, 1)).toBe(4)
  expect(getSourceLineForPc(compiled.program.pcToSourceLine, 2)).toBe(5)
  expect(getSourceLineForPc(compiled.program.pcToSourceLine, 3)).toBe(6)
})

it('returns source line text and ranges for 1-indexed line numbers', () => {
  const sourceText = ['line one', 'line two', 'line three'].join('\n')

  expect(getSourceLines(sourceText)).toEqual(['line one', 'line two', 'line three'])
  expect(getSourceLineText(sourceText, 2)).toBe('line two')
  expect(getLineRangeForLine(sourceText, 2)).toEqual({ start: 9, end: 17 })
})

it('returns null for invalid pc and line lookups', () => {
  expect(getSourceLineForPc([0, 4, 5], 0)).toBeNull()
  expect(getSourceLineForPc([0, 4, 5], 3)).toBeNull()
  expect(getSourceLineText('one\ntwo', 3)).toBeNull()
  expect(getLineRangeForLine('one\ntwo', 0)).toBeNull()
})
