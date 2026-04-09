export async function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (request, reply) => {
    const result = app.authService.register(request.body)
    app.botService.ensureStarterBots(result.user.username)
    app.authService.setSessionCookie(reply, result.sessionId)
    return reply.code(201).send({
      user: result.user,
    })
  })

  app.post('/api/auth/login', async (request, reply) => {
    const result = app.authService.login(request.body)
    app.authService.setSessionCookie(reply, result.sessionId)
    return reply.code(200).send({
      user: result.user,
    })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    app.authService.logout(request.headers.cookie)
    app.authService.clearSessionCookie(reply)
    return reply.code(200).send({
      ok: true,
    })
  })

  app.get('/api/me', async (request) => ({
    user: request.currentUser,
  }))
}
