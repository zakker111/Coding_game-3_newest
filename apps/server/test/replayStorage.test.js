import test from 'node:test'
import assert from 'node:assert/strict'

import { createInMemoryMatchStore } from '../src/store/inMemoryMatchStore.js'
import { createPersistentStoreBundle } from '../src/store/persistentStoreBundle.js'
import { createFileStorage } from '../src/store/fileStorage.js'
import { createSimulationService } from '../src/services/simulationService.js'
import { decodeReplay, encodeReplay, packReplay, readStoredReplay, MAX_STORED_REPLAY_BYTES } from '../src/store/replayCodec.js'
import { mkdtempSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPLAY = { schemaVersion: 1, seed: 5, tickCap: 3, events: [[], [{ type: 'HIT' }], []], state: [{ bots: [] }] }

test('replay codec round-trips and compresses a repetitive replay', () => {
  const big = { ...REPLAY, state: Array.from({ length: 500 }, () => ({ bots: [{ hp: 100 }] })) }
  const encoded = encodeReplay(big)
  assert.deepEqual(decodeReplay(encoded), big)
  assert.ok(encoded.length < JSON.stringify(big).length / 10)
})

test('packReplay drops a replay over the size cap but keeps null as null', () => {
  assert.deepEqual(packReplay(null), { replayGz: null })
  // Random bytes do not compress, so the encoded size is well over the cap.
  const noisy = { blob: randomBytes(3 * MAX_STORED_REPLAY_BYTES).toString('base64') }
  assert.deepEqual(packReplay(noisy), { replayGz: null })
})

test('readStoredReplay reads both the new compressed format and the old plain format', () => {
  assert.deepEqual(readStoredReplay({ replayGz: encodeReplay(REPLAY) }), REPLAY)
  assert.deepEqual(readStoredReplay({ replay: REPLAY }), REPLAY)
  assert.equal(readStoredReplay({ replay: null }), null)
  assert.equal(readStoredReplay(null), null)
})

function fillStore(store, count) {
  const ids = []
  for (let i = 0; i < count; i += 1) {
    const match = store.createMatch({ kind: 'sandbox', matchSeed: i })
    store.markComplete(match.matchId, { result: { winner: `bot${i}` }, replay: { ...REPLAY, seed: i } })
    ids.push(match.matchId)
  }
  return ids
}

function assertPruned(store, ids) {
  const [oldest, middle, newest] = ids
  assert.equal(store.getReplay(oldest), null)
  assert.equal(store.getReplay(middle)?.seed, 1)
  assert.equal(store.getReplay(newest)?.seed, 2)
  // The match record and its result survive pruning.
  assert.equal(store.getMatch(oldest).result.winner, 'bot0')
  assert.equal(store.getMatch(oldest).status, 'complete')
}

test('in-memory store prunes the oldest sandbox replays and keeps their results', () => {
  const store = createInMemoryMatchStore()
  const ids = fillStore(store, 3)
  assert.equal(store.pruneReplays(2), 1)
  assertPruned(store, ids)
  assert.equal(store.pruneReplays(2), 0)
})

test('persistent store prunes the same way and keeps the change after a restart', () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'nowt-replay-')), 'state.json')
  const db = createPersistentStoreBundle({ storage: createFileStorage(filePath) })
  const ids = fillStore(db.matchStore, 3)
  assert.equal(db.matchStore.pruneReplays(2), 1)
  assertPruned(db.matchStore, ids)

  const reloaded = createPersistentStoreBundle({ storage: createFileStorage(filePath) })
  assertPruned(reloaded.matchStore, ids)
})

test('simulation service applies the configured replay retention after each sandbox match', () => {
  const store = createInMemoryMatchStore()
  const service = createSimulationService({
    store,
    config: { maxTickCap: 600, maxSourceChars: 12000, maxSourceLines: 400, replayRetentionCount: 1 },
  })
  const payload = {
    seed: 1,
    tickCap: 20,
    participants: ['A', 'B', 'C', 'D'].map((name, i) => ({
      slot: `BOT${i + 1}`,
      displayName: name,
      sourceText: 'WAIT 1\n',
      loadout: [null, null, null],
    })),
  }
  const first = service.createSimulation(payload)
  const second = service.createSimulation({ ...payload, seed: 2 })
  assert.equal(store.getReplay(first.matchId), null)
  assert.ok(store.getReplay(second.matchId))
})
