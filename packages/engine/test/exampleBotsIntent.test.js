import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runMatchToReplay } from '@coding-game/engine'

import { buildMatchBotsFromSources, extractTextFence, parseLoadoutFromSourceHeader } from './golden/goldenHarnessUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function idleBot(slotId) {
  return { slotId, sourceText: 'WAIT 1\n', loadout: [null, null, null] }
}

function exampleBot(slotId, n) {
  const sourceText = loadExampleBot(n)
  return { slotId, sourceText, loadout: parseLoadoutFromSourceHeader(sourceText) }
}

function botEvents(replay, slotId) {
  return replay.events.flat().filter((e) =>
    e.botId === slotId ||
    e.ownerBotId === slotId ||
    e.victimBotId === slotId ||
    e.sourceBotId === slotId ||
    e.creditedBotId === slotId
  )
}

test('example bot0 aggressively chases the closest target and fires', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 30,
    bots: [
      exampleBot('BOT1', 0),
      idleBot('BOT2'),
      idleBot('BOT3'),
      idleBot('BOT4'),
    ],
  })

  const execs = botEvents(replay, 'BOT1').filter((e) => e.type === 'BOT_EXEC').map((e) => e.instrText)
  const spawns = botEvents(replay, 'BOT1').filter((e) => e.type === 'BULLET_SPAWN')

  assert.ok(execs.includes('SET_TARGET CLOSEST_BOT'))
  assert.ok(execs.includes('SET_MOVE TARGET'))
  assert.ok(spawns.length >= 1, 'expected bot0 to fire at least once')
  assert.equal(spawns[0].targetBotId, 'BOT2')
})

test('example bot1 patrols its home sector in the documented zone loop', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 40,
    bots: [
      exampleBot('BOT1', 1),
      idleBot('BOT2'),
      idleBot('BOT3'),
      idleBot('BOT4'),
    ],
  })

  const visited = new Set(
    replay.state
      .map((s) => s.bots.find((b) => b.botId === 'BOT1'))
      .filter(Boolean)
      .map((b) => `${b.pos.x},${b.pos.y}`)
  )

  assert.ok(visited.has('16,16'), 'expected bot1 to visit zone 1')
  assert.ok(visited.has('48,16'), 'expected bot1 to visit zone 2')
  assert.ok(visited.has('48,48'), 'expected bot1 to visit zone 4')
  assert.ok(visited.has('16,48'), 'expected bot1 to visit zone 3')
})

test('example bot2 prioritizes BOT1 and chases it with explicit targeting', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 30,
    bots: [
      idleBot('BOT1'),
      exampleBot('BOT2', 2),
      idleBot('BOT3'),
      idleBot('BOT4'),
    ],
  })

  const events = botEvents(replay, 'BOT2')
  const firstMove = events.find((e) => e.type === 'BOT_MOVED')
  const firstSpawn = events.find((e) => e.type === 'BULLET_SPAWN')

  assert.ok(firstMove, 'expected bot2 to move toward its chosen target')
  assert.equal(firstMove.dir, 'LEFT')
  assert.ok(firstSpawn, 'expected bot2 to fire at least once')
  assert.equal(firstSpawn.targetBotId, 'BOT1')
})

test('example bot3 holds its corner when no threat or powerup detour is needed', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 20,
    bots: [
      exampleBot('BOT1', 3),
      idleBot('BOT2'),
      idleBot('BOT3'),
      idleBot('BOT4'),
    ],
  })

  const positions = replay.state.map((s) => s.bots.find((b) => b.botId === 'BOT1')?.pos)
  const bulletSpawns = botEvents(replay, 'BOT1').filter((e) => e.type === 'BULLET_SPAWN')

  assert.ok(positions.every((pos) => pos?.x === 16 && pos?.y === 16), 'expected bot3 to stay on its home corner')
  assert.equal(bulletSpawns.length, 0, 'expected bot3 not to fire while enemies stay far away')
})

test('example bot4 uses saw and shield bursts while rushing bullet bots', () => {
  const sources = [4, 0, 1, 2].map((n) => loadExampleBot(n))
  const replay = runMatchToReplay({ seed: 123, tickCap: 120, bots: buildMatchBotsFromSources(sources) })

  const causes = new Set(
    botEvents(replay, 'BOT1')
      .filter((e) => e.type === 'RESOURCE_DELTA')
      .map((e) => e.cause)
  )

  assert.ok(causes.has('SAW_DRAIN'), 'expected bot4 to activate SAW')
  assert.ok(causes.has('SHIELD_DRAIN'), 'expected bot4 to activate SHIELD')
})

test('example bot5 takes up a center posture before engaging', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 20,
    bots: [
      exampleBot('BOT1', 5),
      idleBot('BOT2'),
      idleBot('BOT3'),
      idleBot('BOT4'),
    ],
  })

  const execs = botEvents(replay, 'BOT1').filter((e) => e.type === 'BOT_EXEC').map((e) => e.instrText)
  const posAt10 = replay.state[10].bots.find((b) => b.botId === 'BOT1')?.pos

  assert.ok(execs.includes('SET_MOVE SECTOR 5'))
  assert.ok(posAt10 && posAt10.x > 16 && posAt10.y > 16, 'expected bot5 to move toward sector 5')
})

test('example bot6 uses saw and shield bursts during aggressive skirmishing', () => {
  const sources = [6, 0, 1, 4].map((n) => loadExampleBot(n))
  const replay = runMatchToReplay({ seed: 123, tickCap: 160, bots: buildMatchBotsFromSources(sources) })

  const causes = new Set(
    botEvents(replay, 'BOT1')
      .filter((e) => e.type === 'RESOURCE_DELTA')
      .map((e) => e.cause)
  )

  assert.ok(causes.has('SAW_DRAIN'), 'expected bot6 to activate SAW')
  assert.ok(causes.has('SHIELD_DRAIN'), 'expected bot6 to activate SHIELD')
})
