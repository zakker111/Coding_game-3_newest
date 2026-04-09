import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from '../src/app.js'
import { createPersistentStoreBundle } from '../src/store/persistentStoreBundle.js'

function createStores(filePath) {
  return createPersistentStoreBundle({ filePath })
}

async function registerUser(app, username = 'alice', password = 'password123') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username,
      password,
    },
  })

  assert.equal(response.statusCode, 201)
  return response.headers['set-cookie']
}

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

test('persistent stores survive server rebuilds for users, bots, sessions, and matches', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'nowt-server-'))
  const filePath = join(dir, 'server-state.json')

  const firstStores = createStores(filePath)
  const firstApp = await buildApp({
    store: firstStores.matchStore,
    botStore: firstStores.botStore,
    dailyRunStore: firstStores.dailyRunStore,
    userStore: firstStores.userStore,
  })

  const cookie = await registerUser(firstApp, 'alice', 'password123')

  const saveResponse = await firstApp.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 2\n',
      saveMessage: 'persist me',
    },
  })
  assert.equal(saveResponse.statusCode, 200)

  const createResponse = await firstApp.inject({
    method: 'POST',
    url: '/api/simulations',
    payload: createValidPayload(),
  })
  assert.equal(createResponse.statusCode, 201)
  const matchId = createResponse.json().matchId

  const runResponse = await firstApp.inject({
    method: 'POST',
    url: '/api/runs',
    payload: {
      runDate: '2026-04-09',
      seed: 'daily-seed',
      tickCap: 20,
      maxRoundsPerDay: 1,
    },
  })
  assert.equal(runResponse.statusCode, 201)
  const runId = runResponse.json().runId
  const seasonId = runResponse.json().seasonId

  await firstApp.close()

  const secondStores = createStores(filePath)
  const secondApp = await buildApp({
    store: secondStores.matchStore,
    botStore: secondStores.botStore,
    dailyRunStore: secondStores.dailyRunStore,
    userStore: secondStores.userStore,
  })
  t.after(async () => {
    await secondApp.close()
  })

  const meResponse = await secondApp.inject({
    method: 'GET',
    url: '/api/me',
    headers: {
      cookie,
    },
  })
  assert.equal(meResponse.statusCode, 200)
  assert.equal(meResponse.json().user.username, 'alice')

  const botSourceResponse = await secondApp.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/source',
    headers: {
      cookie,
    },
  })
  assert.equal(botSourceResponse.statusCode, 200)
  assert.equal(botSourceResponse.json().sourceText, 'WAIT 2\n')

  const versionsResponse = await secondApp.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/versions',
    headers: {
      cookie,
    },
  })
  assert.equal(versionsResponse.statusCode, 200)
  assert.equal(versionsResponse.json().versions.length, 2)

  const matchResponse = await secondApp.inject({
    method: 'GET',
    url: `/api/matches/${matchId}`,
  })
  assert.equal(matchResponse.statusCode, 200)
  assert.equal(matchResponse.json().status, 'complete')

  const replayResponse = await secondApp.inject({
    method: 'GET',
    url: `/api/matches/${matchId}/replay`,
  })
  assert.equal(replayResponse.statusCode, 200)
  assert.equal(replayResponse.json().matchSeed, 123)

  const persistedRun = await secondApp.inject({
    method: 'GET',
    url: `/api/runs/${runId}`,
  })
  assert.equal(persistedRun.statusCode, 200)
  assert.equal(persistedRun.json().status, 'complete')

  const standingsResponse = await secondApp.inject({
    method: 'GET',
    url: `/api/seasons/${seasonId}/standings`,
  })
  assert.equal(standingsResponse.statusCode, 200)
  assert.ok(Array.isArray(standingsResponse.json().standings))
})
