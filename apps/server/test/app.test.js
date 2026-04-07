import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../src/app.js'

function createValidPayload() {
  return {
    seed: 123,
    tickCap: 20,
    participants: [
      { slot: 'BOT1', displayName: 'Alpha', sourceText: 'WAIT 1\n', loadout: ['BULLET', null, null] },
      { slot: 'BOT2', displayName: 'Beta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slot: 'BOT3', displayName: 'Gamma', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slot: 'BOT4', displayName: 'Delta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }
}

test('GET /api/ruleset returns shared ruleset metadata', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/ruleset',
  })

  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.rulesetVersion, '0.2.0')
  assert.equal(body.loadoutSlotCount, 3)
  assert.ok(Array.isArray(body.modules))
  assert.ok(body.modules.some((module) => module.id === 'BULLET'))
  assert.equal(response.headers['access-control-allow-origin'], '*')
})

test('OPTIONS preflight returns CORS headers for browser-based Workshop access', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/simulations',
    headers: {
      origin: 'http://127.0.0.1:4173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  })

  assert.equal(response.statusCode, 204)
  assert.equal(response.headers['access-control-allow-origin'], '*')
  assert.match(String(response.headers['access-control-allow-methods']), /POST/)
})

test('POST /api/simulations rejects duplicate participant slots', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const payload = createValidPayload()
  payload.participants[3] = { slot: 'BOT1', sourceText: 'WAIT 1\n', loadout: [null, null, null] }

  const response = await app.inject({
    method: 'POST',
    url: '/api/simulations',
    payload,
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.json().error.code, 'INVALID_REQUEST')
})

test('POST /api/simulations returns compile errors as 400', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const payload = createValidPayload()
  payload.participants[0].sourceText = 'NOT_A_REAL_OP\n'

  const response = await app.inject({
    method: 'POST',
    url: '/api/simulations',
    payload,
  })

  assert.equal(response.statusCode, 400)
  const body = response.json()
  assert.equal(body.error.code, 'COMPILE_ERROR')
  assert.equal(body.error.details.slot, 'BOT1')
  assert.ok(Array.isArray(body.error.details.errors))
})

test('POST /api/simulations creates a match and replay can be fetched', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/simulations',
    payload: createValidPayload(),
  })

  assert.equal(createResponse.statusCode, 201)
  const created = createResponse.json()
  assert.equal(created.kind, 'sandbox')
  assert.equal(created.status, 'complete')
  assert.match(created.matchId, /^m_\d{6}$/)

  const matchResponse = await app.inject({
    method: 'GET',
    url: `/api/matches/${created.matchId}`,
  })

  assert.equal(matchResponse.statusCode, 200)
  const match = matchResponse.json()
  assert.equal(match.matchId, created.matchId)
  assert.equal(match.status, 'complete')
  assert.equal(match.participants.length, 4)
  assert.equal(match.participants[0].displayName, 'Alpha')
  assert.ok(typeof match.participants[0].sourceHash === 'string')

  const replayResponse = await app.inject({
    method: 'GET',
    url: `/api/matches/${created.matchId}/replay`,
  })

  assert.equal(replayResponse.statusCode, 200)
  const replay = replayResponse.json()
  assert.equal(replay.matchSeed, 123)
  assert.ok(Array.isArray(replay.state))
  assert.ok(Array.isArray(replay.events))
})
