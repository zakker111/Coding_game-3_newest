import test from 'node:test'
import assert from 'node:assert/strict'

import { createSimulationService } from '../src/services/simulationService.js'
import { createInMemoryMatchStore } from '../src/store/inMemoryMatchStore.js'

function createService({
  config = { maxTickCap: 600, maxSourceChars: 12000, maxSourceLines: 400 },
  compileSource,
  runMatch,
} = {}) {
  return createSimulationService({
    store: createInMemoryMatchStore(),
    config,
    compileSource,
    runMatch,
  })
}

function createPayload() {
  return {
    seed: 123,
    tickCap: 25,
    participants: [
      { slot: 'BOT1', displayName: 'Alpha', sourceText: 'WAIT 1\r\n', loadout: ['BULLET', null, null] },
      { slot: 'BOT2', displayName: 'Beta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slot: 'BOT3', displayName: 'Gamma', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slot: 'BOT4', displayName: 'Delta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }
}

test('createSimulation is deterministic for the same seed and participants', () => {
  const serviceA = createService()
  const serviceB = createService()

  const payload = createPayload()
  const matchA = serviceA.createSimulation(payload)
  const matchB = serviceB.createSimulation(payload)

  assert.deepStrictEqual(matchA.replay, matchB.replay)
  assert.deepStrictEqual(matchA.result, matchB.result)
  assert.equal(matchA.participants[0].sourceTextSnapshot, 'WAIT 1\n')
})

test('createSimulation normalizes loadouts and preserves issues on participant snapshots', () => {
  const service = createService()
  const payload = createPayload()

  payload.participants[0].loadout = ['BULLET', 'SAW', 'SAW']

  const match = service.createSimulation(payload)

  assert.deepStrictEqual(match.participants[0].loadoutSnapshot, ['BULLET', null, null])
  assert.deepStrictEqual(match.participants[0].loadoutIssues, [
    { kind: 'DUPLICATE', slot: 3, module: 'SAW' },
    { kind: 'MULTI_WEAPON', slot: 2, module: 'SAW' },
  ])
})

test('createSimulation surfaces compile errors with slot details', () => {
  const service = createService()
  const payload = createPayload()

  payload.participants[1].sourceText = 'BAD OPCODE\n'

  assert.throws(
    () => service.createSimulation(payload),
    (error) =>
      error?.statusCode === 400 &&
      error?.code === 'COMPILE_ERROR' &&
      error?.details?.slot === 'BOT2' &&
      Array.isArray(error?.details?.errors)
  )
})

test('createSimulation rejects invalid request bodies before creating a match', () => {
  const service = createService()

  assert.throws(
    () => service.createSimulation(null),
    (error) => error?.statusCode === 400 && error?.code === 'INVALID_REQUEST'
  )
})

test('createSimulation rejects missing participant slots with slot details', () => {
  const service = createService()
  const payload = createPayload()

  payload.participants = payload.participants.slice(0, 3)

  assert.throws(
    () => service.createSimulation(payload),
    (error) =>
      error?.statusCode === 400 &&
      error?.code === 'INVALID_REQUEST' &&
      error?.details?.field === 'participants'
  )
})

test('createSimulation surfaces source limit errors from source snapshots', () => {
  const service = createService({
    config: {
      maxTickCap: 600,
      maxSourceChars: 8,
      maxSourceLines: 2,
    },
  })
  const payload = createPayload()

  payload.participants[0].sourceText = 'WAIT 1234\n'

  assert.throws(
    () => service.createSimulation(payload),
    (error) =>
      error?.statusCode === 400 &&
      error?.code === 'SOURCE_LIMIT_EXCEEDED' &&
      error?.details?.kind === 'chars'
  )
})

test('createSimulation marks the match failed when the engine throws after creation', () => {
  const store = createInMemoryMatchStore()
  const service = createSimulationService({
    store,
    config: { maxTickCap: 600, maxSourceChars: 12000, maxSourceLines: 400 },
    runMatch() {
      throw new Error('boom')
    },
  })
  const payload = createPayload()

  assert.throws(() => service.createSimulation(payload), /boom/)

  const failedMatch = store.getMatch('m_000001')
  assert.equal(failedMatch?.status, 'failed')
  assert.deepStrictEqual(failedMatch?.error, {
    code: 'SIMULATION_FAILED',
    message: 'boom',
  })
})
