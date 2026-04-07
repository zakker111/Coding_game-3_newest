import Fastify from 'fastify'

import { getServerConfig } from './config.js'
import { registerMatchRoutes } from './routes/matches.js'
import { registerRulesetRoutes } from './routes/ruleset.js'
import { registerSimulationRoutes } from './routes/simulations.js'
import { createSimulationService } from './services/simulationService.js'
import { createInMemoryMatchStore } from './store/inMemoryMatchStore.js'

function formatErrorPayload(error) {
  return {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Internal Server Error',
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  }
}

export async function buildApp({ config = getServerConfig(), store = createInMemoryMatchStore() } = {}) {
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
  app.decorate(
    'simulationService',
    createSimulationService({
      store,
      config,
    })
  )

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

  await registerRulesetRoutes(app)
  await registerSimulationRoutes(app)
  await registerMatchRoutes(app)
  await app.ready()

  return app
}
