export async function registerBotRoutes(app) {
  app.get('/api/bots', async (request) => app.botService.listBots(request.query))

  app.get('/api/bots/:owner/:name', async (request) => {
    const { owner, name } = request.params
    return app.botService.getBot(owner, name)
  })

  app.get('/api/bots/:owner/:name/source', async (request) => {
    const { owner, name } = request.params
    return app.botService.getBotSource(owner, name)
  })

  app.put('/api/bots/:owner/:name', async (request, reply) => {
    const { owner, name } = request.params
    const bot = app.botService.saveBot(owner, name, request.body)
    return reply.code(200).send(bot)
  })

  app.get('/api/bots/:owner/:name/versions', async (request) => {
    const { owner, name } = request.params
    return app.botService.listVersions(owner, name)
  })

  app.get('/api/bots/:owner/:name/versions/:sourceHash/source', async (request) => {
    const { owner, name, sourceHash } = request.params
    return app.botService.getVersionSource(owner, name, sourceHash)
  })
}
