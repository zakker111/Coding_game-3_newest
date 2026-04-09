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

test('manual daily runs create a queued daily match that can be processed', async (t) => {
  const harness = await createTestApp()
  t.after(async () => {
    await harness.close()
  })

  const sessionCookie = await registerAndGetCookie(harness.app)
  const runResponse = await harness.app.inject({
    method: 'POST',
    url: '/api/runs',
    cookies: {
      nowt_session: sessionCookie,
    },
    payload: {
      run_date: '2026-04-09',
      run_seed: 'daily-seed-1',
      tick_cap: 6,
      participants: [
        { slot: 'BOT1', bot_id: 'alice/bot1', loadout: ['BULLET', null, null] },
        { slot: 'BOT2', bot_id: 'builtin/zone-patrol-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT3', bot_id: 'builtin/chaser-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT4', bot_id: 'builtin/corner-bunker', loadout: ['BULLET', null, null] },
      ],
    },
  })

  assert.equal(runResponse.statusCode, 201)
  const { matchId } = runResponse.json()

  const processed = await processNextQueuedMatch({
    db: harness.db,
    logger: harness.app.log,
  })

  assert.equal(processed.match.id, matchId)
  assert.equal(processed.match.kind, 'daily')
  assert.equal(processed.match.status, 'complete')

  const replayResponse = await harness.app.inject({
    method: 'GET',
    url: `/api/matches/${matchId}/replay`,
  })

  assert.equal(replayResponse.statusCode, 200)
  assert.equal(replayResponse.json().rulesetVersion, '0.2.0')
})
