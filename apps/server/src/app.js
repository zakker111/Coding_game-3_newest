import Fastify from 'fastify'
import cookie from '@fastify/cookie'

import { registerAuthRoutes } from './routes/auth.js'
import { registerBotRoutes } from './routes/bots.js'
import { registerMatchRoutes } from './routes/matches.js'
import { registerRulesetRoutes } from './routes/ruleset.js'
import { registerRunRoutes } from './routes/runs.js'
import { registerSimulationRoutes } from './routes/simulations.js'

export async function createApp({ config, db, services = {} }) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  })

  await app.register(cookie, {
    secret: config.cookieSecret || 'dev-cookie-secret-change-me',
    hook: 'onRequest',
  })

  app.decorate('configValues', config)
  app.decorate('db', db)
  app.decorate('services', services)

  app.get('/healthz', async () => ({
    ok: true,
    rulesetVersion: services.rulesetVersion,
  }))

  await registerAuthRoutes(app)
  await registerRulesetRoutes(app)
  await registerBotRoutes(app)
  await registerSimulationRoutes(app)
  await registerMatchRoutes(app)
  await registerRunRoutes(app)

  return app
}
