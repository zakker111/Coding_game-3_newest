import test from 'node:test'
import assert from 'node:assert/strict'

import { parseDisplayNameFromScript } from '../../../scripts/deploySync.mjs'

test('parseDisplayNameFromScript: skips locked header directives', () => {
  const src = [
    ';@slot1 BULLET',
    ';@slot2 EMPTY',
    ';@slot3 EMPTY',
    '; bot7 — My Bot',
    'LABEL LOOP',
    'WAIT 1',
    'GOTO LOOP',
    '',
  ].join('\n')

  assert.equal(parseDisplayNameFromScript(src), 'My Bot')
})

test('parseDisplayNameFromScript: only scans leading comment header', () => {
  const src = [
    '; bot0 — Header Name',
    'LABEL LOOP',
    '; bot0 — Not Header',
    'WAIT 1',
    '',
  ].join('\n')

  assert.equal(parseDisplayNameFromScript(src), 'Header Name')
})
