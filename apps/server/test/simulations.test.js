import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestApp } from './_util/testApp.js'
import { processNextQueuedMatch } from '../src/worker/processMatch.js'

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

test('sandbox simulations queue, execute, and expose replay retrieval', async (t) => {
  const harness = await createTestApp()
  t.after(async () => {
    await harness.close()
  })

  const sessionCookie = await registerAndGetCookie(harness.app)
  const enqueueResponse = await harness.app.inject({
    method: 'POST',
    url: '/api/simulations',
    cookies: {
      nowt_session: sessionCookie,
    },
    payload: {
      match_seed: 'server-test-seed',
      tick_cap: 8,
      participants: [
        { slot: 'BOT1', bot_id: 'alice/bot1', loadout: ['BULLET', null, null] },
        { slot: 'BOT2', bot_id: 'builtin/zone-patrol-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT3', bot_id: 'builtin/chaser-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT4', bot_id: 'builtin/corner-bunker', loadout: ['BULLET', null, null] },
      ],
    },
  })

  assert.equal(enqueueResponse.statusCode, 202)
  const matchId = enqueueResponse.json().matchId
  assert.ok(matchId)

  const processed = await processNextQueuedMatch({
    db: harness.db,
    logger: harness.app.log,
  })

  assert.equal(processed.match.id, matchId)
  assert.equal(processed.match.status, 'complete')
  assert.equal(processed.match.result.tick_count, 8)

  const matchResponse = await harness.app.inject({
    method: 'GET',
    url: `/api/matches/${matchId}`,
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(matchResponse.statusCode, 200)
  assert.equal(matchResponse.json().match.status, 'complete')

  const replayResponse = await harness.app.inject({
    method: 'GET',
    url: `/api/matches/${matchId}/replay`,
    cookies: {
      nowt_session: sessionCookie,
    },
  })

  assert.equal(replayResponse.statusCode, 200)
  const replay = replayResponse.json()
  assert.equal(replay.rulesetVersion, '0.2.0')
  assert.equal(replay.matchSeed, 'server-test-seed')
  assert.deepEqual(
    replay.bots.map((bot) => bot.loadout),
    [
      ['BULLET', null, null],
      ['BULLET', null, null],
      ['BULLET', null, null],
      ['BULLET', null, null],
    ],
  )
})
