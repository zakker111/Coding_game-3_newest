import { randomUUID } from 'node:crypto'

import { RULESET_VERSION } from '@coding-game/ruleset'

import { createDailyRun } from '../db/queries/dailyRuns.js'
import { createMatch } from '../db/queries/matches.js'
import { SESSION_COOKIE_NAME, getSessionUser } from '../lib/auth.js'
import { deriveMatchSeed } from '../lib/matchSeeds.js'
import { snapshotMatchParticipants } from '../lib/matchParticipants.js'

async function readViewer(app, request) {
  if (!app.db) return null
  return getSessionUser(app.db, request.cookies[SESSION_COOKIE_NAME])
}

export async function registerRunRoutes(app) {
  app.post('/api/runs', async (request, reply) => {
    if (!app.db) {
      reply.code(503)
      return { error: 'database_unavailable' }
    }

    const viewer = await readViewer(app, request)
    if (!viewer) {
      reply.code(401)
      return { error: 'auth_required' }
    }

    const runDate = typeof request.body?.run_date === 'string' ? request.body.run_date : null
    const runSeed = typeof request.body?.run_seed === 'string' && request.body.run_seed ? request.body.run_seed : null

    if (!runDate || !runSeed) {
      reply.code(400)
      return { error: 'invalid_run_request' }
    }

    const snapshotted = await snapshotMatchParticipants(app.db, viewer.username, request.body?.participants)
    if (snapshotted.error) {
      reply.code(snapshotted.error === 'forbidden' ? 403 : snapshotted.error === 'bot_not_found' ? 404 : 400)
      return { error: snapshotted.error }
    }

    const dailyRun = await createDailyRun(app.db, {
      id: randomUUID(),
      runDate,
      rulesetVersion: RULESET_VERSION,
      runSeed,
      status: 'planned',
    })

    const tickCap = Number.isInteger(request.body?.tick_cap) && request.body.tick_cap > 0 ? request.body.tick_cap : app.configValues.defaultMatchTickCap
    const match = await createMatch(app.db, {
      id: randomUUID(),
      kind: 'daily',
      dailyRunId: dailyRun.id,
      matchSeed: deriveMatchSeed(runSeed, 0),
      tickCap,
      participants: snapshotted.participants,
    })

    reply.code(201)
    return {
      dailyRunId: dailyRun.id,
      matchId: match.id,
      status: match.status,
    }
  })
}
