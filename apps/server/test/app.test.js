import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../src/app.js'
import { createInMemoryMatchStore } from '../src/store/inMemoryMatchStore.js'

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

test('auth register/login/logout establishes and clears the session', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'alice',
      password: 'password123',
    },
  })

  assert.equal(registerResponse.statusCode, 201)
  assert.equal(registerResponse.json().user.username, 'alice')
  const registerCookie = registerResponse.headers['set-cookie']
  assert.match(String(registerCookie), /nowt_session=/)

  const starterBotsResponse = await app.inject({
    method: 'GET',
    url: '/api/bots?owner=alice',
    headers: {
      cookie: registerCookie,
    },
  })

  assert.equal(starterBotsResponse.statusCode, 200)
  assert.deepEqual(
    starterBotsResponse.json().bots.map((bot) => bot.botId),
    ['alice/bot1', 'alice/bot2', 'alice/bot3']
  )

  const meResponse = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: {
      cookie: registerCookie,
    },
  })

  assert.equal(meResponse.statusCode, 200)
  assert.equal(meResponse.json().user.username, 'alice')

  const logoutResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: {
      cookie: registerCookie,
    },
  })

  assert.equal(logoutResponse.statusCode, 200)
  assert.match(String(logoutResponse.headers['set-cookie']), /Max-Age=0/)

  const afterLogout = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: {
      cookie: registerCookie,
    },
  })

  assert.equal(afterLogout.statusCode, 200)
  assert.equal(afterLogout.json().user, null)

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: 'alice',
      password: 'password123',
    },
  })

  assert.equal(loginResponse.statusCode, 200)
  assert.equal(loginResponse.json().user.username, 'alice')
  assert.match(String(loginResponse.headers['set-cookie']), /nowt_session=/)
})

test('auth login rejects invalid credentials', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  await registerUser(app, 'alice', 'password123')

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username: 'alice',
      password: 'wrongpass',
    },
  })

  assert.equal(response.statusCode, 401)
  assert.equal(response.json().error.code, 'INVALID_CREDENTIALS')
})

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

test('GET /api/bots lists builtin bots', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/bots',
  })

  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.ok(Array.isArray(body.bots))
  assert.ok(body.bots.some((bot) => bot.botId === 'builtin/bot0'))
  assert.ok(body.bots.some((bot) => bot.botId === 'builtin/bot6'))
  assert.ok(!body.bots.some((bot) => bot.ownerUsername === 'alice'))
})

test('PUT /api/bots/:owner/:name saves latest source and versions can be fetched', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const cookie = await registerUser(app, 'alice', 'password123')

  const saveResponse = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 1\r\n',
      saveMessage: 'first save',
    },
  })

  assert.equal(saveResponse.statusCode, 200)
  const saved = saveResponse.json()
  assert.equal(saved.botId, 'alice/bot1')
  assert.ok(typeof saved.sourceHash === 'string')

  const metadataResponse = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie,
    },
  })
  assert.equal(metadataResponse.statusCode, 200)
  assert.equal(metadataResponse.json().sourceHash, saved.sourceHash)

  const sourceResponse = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/source',
    headers: {
      cookie,
    },
  })
  assert.equal(sourceResponse.statusCode, 200)
  assert.deepEqual(sourceResponse.json(), {
    botId: 'alice/bot1',
    sourceText: 'WAIT 1\n',
  })

  const versionsResponse = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/versions',
    headers: {
      cookie,
    },
  })
  assert.equal(versionsResponse.statusCode, 200)
  const versionsBody = versionsResponse.json()
  assert.equal(versionsBody.botId, 'alice/bot1')
  assert.equal(versionsBody.versions.length, 2)
  assert.equal(versionsBody.versions[0].saveMessage, 'starter bot')
  assert.equal(versionsBody.versions[1].sourceHash, saved.sourceHash)
  assert.equal(versionsBody.versions[1].saveMessage, 'first save')

  const versionSourceResponse = await app.inject({
    method: 'GET',
    url: `/api/bots/alice/bot1/versions/${saved.sourceHash}/source`,
    headers: {
      cookie,
    },
  })
  assert.equal(versionSourceResponse.statusCode, 200)
  assert.deepEqual(versionSourceResponse.json(), {
    botId: 'alice/bot1',
    sourceHash: saved.sourceHash,
    sourceText: 'WAIT 1\n',
  })
})

test('saving the same bot source dedupes version history by source hash', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const cookie = await registerUser(app, 'alice', 'password123')

  const firstSave = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 1\n',
      saveMessage: 'first',
    },
  })

  const secondSave = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 1\n',
      saveMessage: 'second',
    },
  })

  assert.equal(firstSave.statusCode, 200)
  assert.equal(secondSave.statusCode, 200)
  assert.equal(firstSave.json().sourceHash, secondSave.json().sourceHash)

  const versionsResponse = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/versions',
    headers: {
      cookie,
    },
  })

  assert.equal(versionsResponse.statusCode, 200)
  const versionsBody = versionsResponse.json()
  assert.equal(versionsBody.versions.length, 2)
  assert.equal(versionsBody.versions[1].saveMessage, 'first')
})

test('PUT /api/bots forbids writes to builtin bots', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const cookie = await registerUser(app, 'alice', 'password123')

  const response = await app.inject({
    method: 'PUT',
    url: '/api/bots/builtin/bot0',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 1\n',
    },
  })

  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error.code, 'FORBIDDEN')
})

test('PUT /api/bots requires an authenticated session and enforces ownership', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const unauthenticated = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/skirmisher',
    payload: {
      sourceText: 'WAIT 1\n',
    },
  })

  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(unauthenticated.json().error.code, 'AUTH_REQUIRED')

  const bobCookie = await registerUser(app, 'bob', 'password123')
  const wrongOwner = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/skirmisher',
    headers: {
      cookie: bobCookie,
    },
    payload: {
      sourceText: 'WAIT 1\n',
    },
  })

  assert.equal(wrongOwner.statusCode, 403)
  assert.equal(wrongOwner.json().error.code, 'FORBIDDEN')
})

test('GET /api/bots/:owner/:name returns 404 for unknown bots', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const cookie = await registerUser(app, 'alice', 'password123')

  const response = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/missing',
    headers: {
      cookie,
    },
  })

  assert.equal(response.statusCode, 404)
  assert.equal(response.json().error.code, 'BOT_NOT_FOUND')
})

test('GET /api/bots requires authentication for user-owned bot reads', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  await registerUser(app, 'alice', 'password123')

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/api/bots?owner=alice',
  })

  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(unauthenticated.json().error.code, 'AUTH_REQUIRED')
})

test('PUT /api/bots enforces the three-bot cap for new bot creation', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const cookie = await registerUser(app, 'alice', 'password123')

  const response = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/skirmisher',
    headers: {
      cookie,
    },
    payload: {
      sourceText: 'WAIT 1\n',
    },
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().error.code, 'MAX_BOTS_REACHED')
})

test('version history endpoints require the authenticated owner for user bots', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  const aliceCookie = await registerUser(app, 'alice', 'password123')

  const saveResponse = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: {
      cookie: aliceCookie,
    },
    payload: {
      sourceText: 'WAIT 2\n',
      saveMessage: 'updated',
    },
  })

  assert.equal(saveResponse.statusCode, 200)
  const sourceHash = saveResponse.json().sourceHash

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/versions',
  })
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(unauthenticated.json().error.code, 'AUTH_REQUIRED')

  const bobCookie = await registerUser(app, 'bob', 'password123')
  const wrongOwner = await app.inject({
    method: 'GET',
    url: `/api/bots/alice/bot1/versions/${sourceHash}/source`,
    headers: {
      cookie: bobCookie,
    },
  })
  assert.equal(wrongOwner.statusCode, 403)
  assert.equal(wrongOwner.json().error.code, 'FORBIDDEN')

  const ownerResponse = await app.inject({
    method: 'GET',
    url: `/api/bots/alice/bot1/versions/${sourceHash}/source`,
    headers: {
      cookie: aliceCookie,
    },
  })
  assert.equal(ownerResponse.statusCode, 200)
  assert.equal(ownerResponse.json().sourceText, 'WAIT 2\n')
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
  assert.equal(response.headers['access-control-allow-origin'], 'http://127.0.0.1:4173')
  assert.equal(response.headers['access-control-allow-credentials'], 'true')
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

test('POST /api/simulations rejects invalid request bodies', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/simulations',
    payload: null,
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.json().error.code, 'INVALID_REQUEST')
})

test('POST /api/simulations rejects oversized source with actionable details', async (t) => {
  const app = await buildApp({
    config: {
      host: '127.0.0.1',
      port: 3000,
      maxTickCap: 600,
      maxSourceChars: 8,
      maxSourceLines: 400,
      bodyLimit: 262144,
    },
  })
  t.after(async () => {
    await app.close()
  })

  const payload = createValidPayload()
  payload.participants[0].sourceText = 'WAIT 1234\n'

  const response = await app.inject({
    method: 'POST',
    url: '/api/simulations',
    payload,
  })

  assert.equal(response.statusCode, 400)
  const body = response.json()
  assert.equal(body.error.code, 'SOURCE_LIMIT_EXCEEDED')
  assert.equal(body.error.details.kind, 'chars')
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

test('GET /api/matches/:matchId returns 404 for unknown matches', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/matches/m_999999',
  })

  assert.equal(response.statusCode, 404)
  assert.equal(response.json().error.code, 'MATCH_NOT_FOUND')
})

test('GET /api/matches/:matchId/replay returns 409 until the match completes', async (t) => {
  const store = createInMemoryMatchStore()
  const queued = store.createMatch({
    matchSeed: 123,
    tickCap: 20,
    participants: [],
  })

  const app = await buildApp({ store })
  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'GET',
    url: `/api/matches/${queued.matchId}/replay`,
  })

  assert.equal(response.statusCode, 409)
  const body = response.json()
  assert.equal(body.error.code, 'MATCH_NOT_COMPLETE')
  assert.equal(body.error.details.status, 'queued')
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
  assert.equal(Object.prototype.hasOwnProperty.call(replay.state[0].bots[0], 'targetMineId'), true)
})
