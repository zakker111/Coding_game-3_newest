import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import path from 'node:path'

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

const RATE_LIMIT_WINDOW_MS = 60_000

// Returns a function that, for a matching request over its limit, sends 429 and returns the reply.
// Otherwise returns undefined. A limit of 0 or less disables the limiter.
function createRateLimiter({ limit, match, message }) {
  const buckets = new Map()
  const enabled = Number.isFinite(limit) && limit > 0
  if (enabled) {
    setInterval(() => {
      const now = Date.now()
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key)
      }
    }, RATE_LIMIT_WINDOW_MS).unref?.()
  }

  return (request, reply, path) => {
    if (!enabled || !match(path, request.method)) return undefined
    const key = request.ip || 'unknown'
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.count <= limit) return undefined
    reply.header('retry-after', Math.ceil((bucket.resetAt - now) / 1000))
    return reply.code(429).send({ error: { code: 'RATE_LIMITED', message } })
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
    trustProxy: config.trustProxy > 0 ? config.trustProxy : false,
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
    config,
  })
  const botService = createBotService({
    store: botStore,
    config,
  })
  const simulationService = createSimulationService({
    store,
    config,
  })

  app.decorate('authService', authService)
  app.decorate('simulationService', simulationService)
  app.decorate('botService', botService)
  authService.ensureDefaultAdmin()
  if (typeof botStore.getBot === 'function' && typeof botStore.saveBot === 'function') {
    botService.ensureStarterBots('admin')
  }
  app.decorate(
    'dailyRunService',
    createDailyRunService({
      store: dailyRunStore,
      botStore,
      matchStore: store,
      simulationService,
      config,
    })
  )
  app.decorateRequest('currentUser', null)

  // Per-client-IP limits. The client IP comes from request.ip, which depends on NOWT_TRUST_PROXY.
  const authLimiter = createRateLimiter({
    limit: config.rateLimitAuthPerMinute,
    match: (path, method) => method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/register'),
    message: 'Too many auth attempts, slow down.',
  })
  const simulationLimiter = createRateLimiter({
    limit: config.rateLimitSimulationsPerMinute,
    match: (path, method) => method === 'POST' && path === '/api/simulations',
    message: 'Too many simulation requests, slow down.',
  })

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0].replace(/\/+$/, '') || '/'
    const limited = authLimiter(request, reply, path) || simulationLimiter(request, reply, path)
    if (limited) return limited
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

  const webDistPath = config.webDistPath ? path.resolve(config.webDistPath) : null
  const serveWeb = Boolean(webDistPath && existsSync(path.join(webDistPath, 'index.html')))
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDistPath, wildcard: true })
  }

  app.setNotFoundHandler((request, reply) => {
    if (serveWeb && request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/assets/')) {
      return reply.type('text/html').sendFile('index.html')
    }
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
