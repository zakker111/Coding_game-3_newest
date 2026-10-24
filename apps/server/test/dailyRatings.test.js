import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { recomputeRatings } from '../src/tools/recomputeRatings.js'

async function registerUser(app, username, password = 'password123') {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } })
  assert.equal(response.statusCode, 201)
  return response.headers['set-cookie']
}

test('daily run leaderboard carries rating fields, and backfill from stored matches reproduces them', async (t) => {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })

  const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'admin' } })
  assert.equal(adminLogin.statusCode, 200)
  const adminCookie = adminLogin.headers['set-cookie']
  await registerUser(app, 'alice')

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/bots/admin/bot1',
    headers: { cookie: adminCookie },
    payload: { sourceText: 'WAIT 1\n', loadout: ['BULLET', 'ARMOR', null] },
  })
  assert.equal(saved.statusCode, 200, saved.body)

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs/daily',
    headers: { cookie: adminCookie },
    payload: { runDate: '2026-06-01', seed: 'rating-seed', tickCap: 20, maxRounds: 1 },
  })
  assert.equal(createResponse.statusCode, 201)
  const run = createResponse.json()
  assert.ok(run.summary.leaderboard.length >= 4)

  for (let index = 0; index < run.summary.leaderboard.length; index += 1) {
    const entry = run.summary.leaderboard[index]
    assert.equal(typeof entry.rating, 'number')
    assert.equal(typeof entry.ratingDeviation, 'number')
    assert.equal(entry.ratingMatches, entry.matchesPlayed)
    assert.equal(entry.provisional, entry.matchesPlayed < 10)
    if (index > 0) {
      assert.ok(run.summary.leaderboard[index - 1].rating >= entry.rating, 'leaderboard sorted by rating')
    }
  }

  const matchesResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.runId}/matches` })
  const backfilled = recomputeRatings(matchesResponse.json().matches)
  for (const entry of run.summary.leaderboard) {
    const state = backfilled.get(entry.botId)
    assert.ok(state, `backfill has ${entry.botId}`)
    assert.ok(Math.abs(state.rating - entry.rating) < 1e-9, `${entry.botId}: live ${entry.rating} vs backfill ${state.rating}`)
    assert.ok(Math.abs(state.ratingDeviation - entry.ratingDeviation) < 1e-9)
  }

  const rankedState = await app.inject({ method: 'GET', url: '/api/admin/ranked', headers: { cookie: adminCookie } })
  assert.equal(rankedState.statusCode, 200)
  const rankedBots = rankedState.json().bots
  assert.ok(rankedBots.length >= 1)
  for (const bot of rankedBots) {
    assert.equal(typeof bot.rating, 'number')
    assert.equal(typeof bot.ratingDeviation, 'number')
    assert.equal(typeof bot.provisional, 'boolean')
  }
})
