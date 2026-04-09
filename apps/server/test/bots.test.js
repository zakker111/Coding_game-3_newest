import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestApp } from './_util/testApp.js'

async function registerAndGetCookie(app) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'Alice',
      password: 'hunter22',
    },
  })

  const cookie = response.cookies.find((item) => item.name === 'nowt_session')
  assert.ok(cookie)
  return cookie.value
}

test('listing bots includes built-ins and starter user bots after registration', async (t) => {
  const harness = await createTestApp()
  t.after(async () => {
    await harness.close()
  })

  const sessionCookie = await registerAndGetCookie(harness.app)
  const response = await harness.app.inject({
    method: 'GET',
    url: '/api/bots',
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.bots.some((bot) => bot.botId === 'builtin/aggressive-skirmisher'), true)
  assert.equal(body.bots.some((bot) => bot.botId === 'alice/bot1'), true)
  assert.equal(body.bots.some((bot) => bot.botId === 'alice/bot2'), true)
  assert.equal(body.bots.some((bot) => bot.botId === 'alice/bot3'), true)
})

test('saving a bot canonicalizes source, normalizes loadout, and dedupes versions by source hash', async (t) => {
  const harness = await createTestApp()
  t.after(async () => {
    await harness.close()
  })

  const sessionCookie = await registerAndGetCookie(harness.app)

  const saveResponse = await harness.app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    cookies: {
      nowt_session: sessionCookie,
    },
    payload: {
      source_text: 'LABEL LOOP  \r\n  WAIT 1\t\r\nGOTO LOOP\r\n\r\n',
      loadout: ['BULLET', 'LASER', 'ARMOR'],
      save_message: 'first save',
    },
  })

  assert.equal(saveResponse.statusCode, 200)
  const saveBody = saveResponse.json()
  assert.deepEqual(saveBody.loadout_issues, [{ kind: 'UNKNOWN_MODULE', slot: 2, module: 'LASER' }])
  assert.deepEqual(saveBody.bot.loadout, ['BULLET', null, 'ARMOR'])

  const sourceResponse = await harness.app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/source',
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(sourceResponse.statusCode, 200)
  assert.equal(sourceResponse.json().source_text, 'LABEL LOOP\n  WAIT 1\nGOTO LOOP\n')

  const secondSaveResponse = await harness.app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    cookies: {
      nowt_session: sessionCookie,
    },
    payload: {
      source_text: 'LABEL LOOP\n  WAIT 1\nGOTO LOOP\n',
      loadout: ['BULLET', null, 'ARMOR'],
      save_message: 'same source',
    },
  })

  assert.equal(secondSaveResponse.statusCode, 200)

  const versionsResponse = await harness.app.inject({
    method: 'GET',
    url: '/api/bots/alice/bot1/versions',
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(versionsResponse.statusCode, 200)
  const versions = versionsResponse.json().versions
  assert.equal(versions.length, 1)

  const versionSourceResponse = await harness.app.inject({
    method: 'GET',
    url: `/api/bots/alice/bot1/versions/${versions[0].source_hash}/source`,
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(versionSourceResponse.statusCode, 200)
  assert.equal(versionSourceResponse.json().source_text, 'LABEL LOOP\n  WAIT 1\nGOTO LOOP\n')
})
