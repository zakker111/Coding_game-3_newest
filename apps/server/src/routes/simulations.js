import { randomUUID } from 'node:crypto'

import { createMatch } from '../db/queries/matches.js'
import { getSessionUser, SESSION_COOKIE_NAME } from '../lib/auth.js'
import { snapshotMatchParticipants } from '../lib/matchParticipants.js'

async function readViewer(app, request) {
  if (!app.db) return null
  return getSessionUser(app.db, request.cookies[SESSION_COOKIE_NAME])
}

export async function registerSimulationRoutes(app) {
  app.post('/api/simulations', async (request, reply) => {
    if (!app.db) {
      reply.code(503)
      return { error: 'database_unavailable' }
    }

    const viewer = await readViewer(app, request)
    if (!viewer) {
      reply.code(401)
      return { error: 'auth_required' }
    }

    const snapshotted = await snapshotMatchParticipants(app.db, viewer.username, request.body?.participants)
    if (snapshotted.error) {
      reply.code(snapshotted.error === 'forbidden' ? 403 : snapshotted.error === 'bot_not_found' ? 404 : 400)
      return { error: snapshotted.error }
    }

    const tickCap = Number.isInteger(request.body?.tick_cap) && request.body.tick_cap > 0 ? request.body.tick_cap : app.configValues.defaultMatchTickCap
    const match = await createMatch(app.db, {
      id: randomUUID(),
      kind: 'sandbox',
      requestedByUserId: viewer.id,
      matchSeed: request.body?.match_seed ?? randomUUID(),
      tickCap,
      participants: snapshotted.participants,
    })

    reply.code(202)
    return {
      matchId: match.id,
      status: match.status,
    }
  })
}
