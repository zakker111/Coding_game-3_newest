import { getMatchById } from '../db/queries/matches.js'
import { getReplayBlobByMatchId } from '../db/queries/replays.js'
import { SESSION_COOKIE_NAME, getSessionUser } from '../lib/auth.js'
import { decodeReplayPayload } from '../lib/replayStore.js'

async function readViewer(app, request) {
  if (!app.db) return null
  return getSessionUser(app.db, request.cookies[SESSION_COOKIE_NAME])
}

function canViewMatch(viewer, match) {
  if (!match) return false
  if (match.kind === 'daily') return true
  return Boolean(viewer && match.requested_by_user_id === viewer.id)
}

export async function registerMatchRoutes(app) {
  app.get('/api/matches/:matchId', async (request, reply) => {
    if (!app.db) {
      reply.code(503)
      return { error: 'database_unavailable' }
    }

    const viewer = await readViewer(app, request)
    const match = await getMatchById(app.db, request.params.matchId)

    if (!canViewMatch(viewer, match)) {
      reply.code(404)
      return { error: 'match_not_found' }
    }

    return {
      match,
    }
  })

  app.get('/api/matches/:matchId/replay', async (request, reply) => {
    if (!app.db) {
      reply.code(503)
      return { error: 'database_unavailable' }
    }

    const viewer = await readViewer(app, request)
    const match = await getMatchById(app.db, request.params.matchId)

    if (!canViewMatch(viewer, match)) {
      reply.code(404)
      return { error: 'match_not_found' }
    }

    const replayBlob = await getReplayBlobByMatchId(app.db, request.params.matchId)
    if (!replayBlob) {
      reply.code(404)
      return { error: 'replay_not_found' }
    }

    return decodeReplayPayload(replayBlob)
  })
}
