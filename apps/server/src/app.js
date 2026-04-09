import Fastify from 'fastify'

import { getServerConfig } from './config.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerBotRoutes } from './routes/bots.js'
import { registerMatchRoutes } from './routes/matches.js'
import { registerRunRoutes } from './routes/runs.js'
import { registerRulesetRoutes } from './routes/ruleset.js'
import { registerSeasonRoutes } from './routes/seasons.js'
import { createAuthService } from './services/authService.js'
import { createDailyRunService } from './services/dailyRunService.js'
import { registerSimulationRoutes } from './routes/simulations.js'
import { createBotService } from './services/botService.js'
import { createSimulationService } from './services/simulationService.js'
import { createInMemoryBotStore } from './store/inMemoryBotStore.js'
import { createInMemoryDailyRunStore } from './store/inMemoryDailyRunStore.js'
import { createInMemoryMatchStore } from './store/inMemoryMatchStore.js'
import { createInMemoryUserStore } from './store/inMemoryUserStore.js'

function formatErrorPayload(error) {
  return {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Internal Server Error',
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  }
}

export async function buildApp({
  config = getServerConfig(),
  store = createInMemoryMatchStore(),
  botStore = createInMemoryBotStore(),
  dailyRunStore = createInMemoryDailyRunStore(),
  userStore = createInMemoryUserStore(),
} = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: config.bodyLimit,
    disableRequestLogging: true,
    routerOptions: {
      ignoreTrailingSlash: true,
    },
  })

  app.decorate('serverConfig', config)
  app.decorate('matchStore', store)
  app.decorate('botStore', botStore)
  app.decorate('dailyRunStore', dailyRunStore)
  app.decorate('userStore', userStore)
  app.decorate(
    'authService',
    createAuthService({
      store: userStore,
    })
  )
  app.decorate(
    'simulationService',
    createSimulationService({
      store,
      config,
    })
  )
  app.decorate(
    'botService',
    createBotService({
      store: botStore,
      config,
    })
  )
  app.decorate(
    'dailyRunService',
    createDailyRunService({
      dailyRunStore,
      matchStore: store,
      botStore,
      config,
    })
  )
  app.decorateRequest('currentUser', null)

  app.addHook('onRequest', async (request) => {
    request.currentUser = app.authService.getCurrentUser(request.headers.cookie)
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('access-control-allow-origin', request.headers.origin || '*')
    reply.header('vary', 'origin')
    reply.header('access-control-allow-credentials', 'true')
    reply.header('access-control-allow-methods', 'GET,POST,PUT,OPTIONS')
    reply.header('access-control-allow-headers', 'content-type')
    return payload
  })

  app.options('/*', async (request, reply) => {
    reply.code(204).send()
  })

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error?.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500

    request.log.error({ err: error }, 'request failed')
    reply.code(statusCode).send(formatErrorPayload(error))
  })

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${request.method} ${request.url}`,
      },
    })
  })

  await registerAuthRoutes(app)
  await registerRulesetRoutes(app)
  await registerBotRoutes(app)
  await registerSimulationRoutes(app)
  await registerMatchRoutes(app)
  await registerRunRoutes(app)
  await registerSeasonRoutes(app)
  await app.ready()

  return app
}
