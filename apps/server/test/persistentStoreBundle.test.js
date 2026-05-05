import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from '../src/app.js'
import { createJsonDatabase } from '../src/store/jsonDatabase.js'

function createStores(filePath) {
  return createJsonDatabase({ filePath })
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

function createDailyBotStore() {
  const sourceText = 'WAIT 1\n'
  const bots = ['daily/bot1', 'daily/bot2', 'daily/bot3', 'daily/bot4']

  return {
    listBots() {
      return bots.map((botId) => {
        const [ownerUsername, name] = botId.split('/')
        return {
          botId,
          ownerUsername,
          name,
          updatedAt: null,
          sourceHash: null,
        }
      })
    },

    getBotSource(ownerUsername, name) {
      return {
        botId: `${ownerUsername}/${name}`,
        sourceText,
      }
    },
  }
}

test('persistent stores survive server rebuilds for users, bots, sessions, and matches', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'nowt-server-'))
  const filePath = join(dir, 'server-state.json')

  const firstStores = createStores(filePath)
  const firstApp = await buildApp({
    store: firstStores.matchStore,
    botStore: firstStores.botStore,
    userStore: firstStores.userStore,
    dailyRunStore: firstStores.dailyRunStore,
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

  await firstApp.close()

  const dailyStores = createStores(filePath)
  const dailyApp = await buildApp({
    store: dailyStores.matchStore,
    botStore: createDailyBotStore(),
    userStore: dailyStores.userStore,
    dailyRunStore: dailyStores.dailyRunStore,
  })

  const adminLoginResponse = await dailyApp.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: 'admin',
      password: 'admin',
    },
  })
  assert.equal(adminLoginResponse.statusCode, 200)

  const dailyRunResponse = await dailyApp.inject({
    method: 'POST',
    url: '/api/runs/daily',
    headers: {
      cookie: adminLoginResponse.headers['set-cookie'],
    },
    payload: {
      runDate: '2026-05-04',
      seed: 'persistent-daily',
      tickCap: 20,
    },
  })
  assert.equal(dailyRunResponse.statusCode, 201)
  const dailyRunId = dailyRunResponse.json().runId

  await dailyApp.close()

  const secondStores = createStores(filePath)
  const secondApp = await buildApp({
    store: secondStores.matchStore,
    botStore: secondStores.botStore,
    userStore: secondStores.userStore,
    dailyRunStore: secondStores.dailyRunStore,
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

  const loginAfterRebuildResponse = await secondApp.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: 'alice',
      password: 'password123',
    },
  })
  assert.equal(loginAfterRebuildResponse.statusCode, 200)
  assert.equal(loginAfterRebuildResponse.json().user.username, 'alice')

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

  const dailyRunAfterRebuild = await secondApp.inject({
    method: 'GET',
    url: `/api/runs/${dailyRunId}`,
  })
  assert.equal(dailyRunAfterRebuild.statusCode, 200)
  assert.equal(dailyRunAfterRebuild.json().status, 'complete')
  assert.equal(dailyRunAfterRebuild.json().matchIds.length, 1)
})
