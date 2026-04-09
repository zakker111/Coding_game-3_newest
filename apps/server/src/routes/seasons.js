export async function registerSeasonRoutes(app) {
  app.get('/api/seasons/current/standings', async (request) =>
    app.dailyRunService.getStandings({
      runDate: request.query?.runDate,
    })
  )

  app.get('/api/seasons/:seasonId/standings', async (request) =>
    app.dailyRunService.getStandings({
      seasonId: request.params.seasonId,
    })
  )

  app.post('/api/seasons/current/bots/:owner/:name/re-enable', async (request) =>
    app.dailyRunService.reenableBot(request.params.owner, request.params.name, {
      currentUser: request.currentUser,
      runDate: request.body?.runDate,
    })
  )

  app.post('/api/seasons/:seasonId/bots/:owner/:name/re-enable', async (request) =>
    app.dailyRunService.reenableBot(request.params.owner, request.params.name, {
      currentUser: request.currentUser,
      seasonId: request.params.seasonId,
    })
  )
}
