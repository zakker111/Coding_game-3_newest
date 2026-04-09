import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeReplayPayload, decodeReplayPayload } from '../src/lib/replayStore.js'

test('replay store gzip round-trips replay payloads', () => {
  const replay = {
    schemaVersion: '0.2.0',
    rulesetVersion: '0.2.0',
    matchSeed: 'seed-1',
    tickCap: 1,
    ticksPerSecond: 4,
    bots: [],
    state: [{ t: 0, bots: [], bullets: [], powerups: [] }, { t: 1, bots: [], bullets: [], powerups: [] }],
    events: [[], [{ type: 'MATCH_END', endReason: 'TICK_CAP' }]],
  }

  const encoded = encodeReplayPayload(replay)
  assert.equal(encoded.encoding, 'gzip')
  assert.ok(encoded.replayBytes.length > 0)

  const decoded = decodeReplayPayload({
    match_id: 'match-1',
    encoding: encoded.encoding,
    sha256: encoded.sha256,
    replay_bytes: encoded.replayBytes,
  })

  assert.deepEqual(decoded, replay)
})
