function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function buildMatchResponse(match) {
  return {
    matchId: match.matchId,
    kind: match.kind,
    status: match.status,
    matchSeed: match.matchSeed,
    tickCap: match.tickCap,
    result: match.result,
    participants: match.participants,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    ...(match.error ? { error: match.error } : {}),
  }
}

export async function registerMatchRoutes(app) {
  app.get('/api/matches/:matchId', async (request) => {
    const match = app.matchStore.getMatch(request.params.matchId)
    if (!match) {
      throw createHttpError(404, 'MATCH_NOT_FOUND', 'Match not found')
    }
    return buildMatchResponse(match)
  })

  app.get('/api/matches/:matchId/replay', async (request) => {
    const match = app.matchStore.getMatch(request.params.matchId)
    if (!match) {
      throw createHttpError(404, 'MATCH_NOT_FOUND', 'Match not found')
    }
    if (match.status !== 'complete') {
      throw createHttpError(409, 'MATCH_NOT_COMPLETE', 'Replay is not available until the match completes', {
        status: match.status,
      })
    }

    const replay = app.matchStore.getReplay(request.params.matchId)
    if (!replay) {
      throw createHttpError(404, 'REPLAY_NOT_FOUND', 'Replay not found')
    }
    return replay
  })
}
