import Fastify from 'fastify'

import { getServerConfig } from './config.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerBotRoutes } from './routes/bots.js'
import { registerDailyRunRoutes } from './routes/dailyRuns.js'
import { registerMatchRoutes } from './routes/matches.js'
import { registerRulesetRoutes } from './routes/ruleset.js'
import { createAuthService } from './services/authService.js'
import { registerSimulationRoutes } from './routes/simulations.js'
import { createBotService } from './services/botService.js'
import { createDailyRunService } from './services/dailyRunService.js'
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
  userStore = createInMemoryUserStore(),
  dailyRunStore = createInMemoryDailyRunStore(),
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
  app.decorate('userStore', userStore)
  app.decorate('dailyRunStore', dailyRunStore)
  const authService = createAuthService({
    store: userStore,
  })
  const botService = createBotService({
    store: botStore,
    config,
  })

  app.decorate(
    'authService',
    authService
  )
  authService.ensureDefaultAdmin()
  app.decorate(
    'simulationService',
    createSimulationService({
      store,
      config,
    })
  )
  if (typeof botStore.getBot === 'function' && typeof botStore.saveBot === 'function') {
    botService.ensureStarterBots('admin')
  }
  app.decorate(
    'botService',
    botService
  )
  app.decorate(
    'dailyRunService',
    createDailyRunService({
      store: dailyRunStore,
      botStore,
      matchStore: store,
      simulationService: app.simulationService,
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
  await registerDailyRunRoutes(app)
  await registerMatchRoutes(app)
  await app.ready()

  return app
}
