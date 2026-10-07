function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function requireAdmin(request) {
  if (request.currentUser?.username !== 'admin') {
    throw createHttpError(403, 'ADMIN_REQUIRED', 'admin login is required')
  }
}

export async function registerDailyRunRoutes(app) {
  app.get('/api/runs', async () => app.dailyRunService.listRuns())

  app.get('/api/runs/latest', async () => app.dailyRunService.getLatestRun())

  app.post('/api/runs/daily', async (request, reply) => {
    requireAdmin(request)
    const run = app.dailyRunService.createRun(request.body ?? {})
    return reply.code(201).send(run)
  })

  app.get('/api/admin/ranked', async (request) => {
    requireAdmin(request)
    return app.dailyRunService.getRankedState()
  })

  app.patch('/api/admin/ranked/:owner/:name', async (request) => {
    requireAdmin(request)
    return app.dailyRunService.setRankedStatus({
      ownerUsername: request.params.owner,
      name: request.params.name,
      rankedStatus: request.body?.rankedStatus,
    })
  })

  app.get('/api/runs/:runId', async (request) => app.dailyRunService.getRun(request.params.runId))

  app.get('/api/runs/:runId/matches', async (request) => app.dailyRunService.getRunMatches(request.params.runId))
}
