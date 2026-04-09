import test from 'node:test'
import assert from 'node:assert/strict'

import { compileBotSource } from '@coding-game/engine'

import { BUILTIN_BOT_SPECS, extractFirstTextFence, loadBuiltinBots } from '../src/lib/builtinBots.js'

test('extractFirstTextFence returns the first text fence with a trailing newline', () => {
  const sourceText = extractFirstTextFence(`# Example\n\n\`\`\`text\nWAIT 1\n\`\`\`\n\n\`\`\`text\nWAIT 2\n\`\`\`\n`)
  assert.equal(sourceText, 'WAIT 1\n')
})

test('loadBuiltinBots loads all built-in definitions with explicit identities', async () => {
  const builtins = await loadBuiltinBots()

  assert.equal(builtins.length, BUILTIN_BOT_SPECS.length)
  assert.deepEqual(
    builtins.map((bot) => bot.botId),
    [
      'builtin/aggressive-skirmisher',
      'builtin/zone-patrol-shooter',
      'builtin/chaser-shooter',
      'builtin/corner-bunker',
      'builtin/saw-rusher',
      'builtin/burst-hunter',
      'builtin/energy-saw-skirmisher',
    ],
  )
})

test('built-in source snapshots compile successfully', async () => {
  const builtins = await loadBuiltinBots()

  for (const builtin of builtins) {
    const compile = compileBotSource(builtin.sourceText)
    assert.deepEqual(compile.errors, [], `expected ${builtin.botId} to compile`)
  }
})
