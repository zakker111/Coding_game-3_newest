import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

import { createTestApp } from './_util/testApp.js'
import { getMatchById } from '../src/db/queries/matches.js'
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

test('server worker replay matches direct engine output for the snapshotted participants', async (t) => {
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
      match_seed: 'parity-seed',
      tick_cap: 10,
      participants: [
        { slot: 'BOT1', bot_id: 'alice/bot1', loadout: ['BULLET', null, null] },
        { slot: 'BOT2', bot_id: 'builtin/zone-patrol-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT3', bot_id: 'builtin/chaser-shooter', loadout: ['BULLET', null, null] },
        { slot: 'BOT4', bot_id: 'builtin/corner-bunker', loadout: ['BULLET', null, null] },
      ],
    },
  })

  const matchId = enqueueResponse.json().matchId
  const queuedMatch = await getMatchById(harness.db, matchId)
  const processed = await processNextQueuedMatch({
    db: harness.db,
    logger: harness.app.log,
  })

  const directReplay = runMatchToReplay({
    seed: queuedMatch.match_seed,
    tickCap: queuedMatch.tick_cap,
    bots: ['BOT1', 'BOT2', 'BOT3', 'BOT4'].map((slotId) => {
      const participant = queuedMatch.participants.find((entry) => entry.slot === slotId)
      return {
        slotId,
        sourceText: participant.source_text_snapshot,
        loadout: participant.loadout_snapshot,
      }
    }),
  })

  assert.deepEqual(processed.replay, directReplay)
})
