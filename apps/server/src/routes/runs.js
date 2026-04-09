export async function registerRunRoutes(app) {
  app.get('/api/runs', async () => app.dailyRunService.listRuns())

  app.post('/api/runs', async (request, reply) => {
    const run = app.dailyRunService.createDailyRun(request.body ?? {})
    return reply.code(201).send(run)
  })

  app.get('/api/runs/:runId', async (request) => app.dailyRunService.getRun(request.params.runId))

  app.get('/api/runs/:runId/matches', async (request) => app.dailyRunService.listRunMatches(request.params.runId))
}
