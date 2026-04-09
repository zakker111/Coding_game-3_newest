const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3001
const DEFAULT_SESSION_TTL_HOURS = 24 * 14
const DEFAULT_QUEUE_POLL_MS = 1_000
const DEFAULT_MATCH_TICK_CAP = 600
const DEFAULT_LOG_LEVEL = 'info'

function parseIntegerEnv(env, name, fallback) {
  const raw = env[name]
  if (raw == null || raw === '') return fallback

  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}

function parseBooleanEnv(env, name, fallback) {
  const raw = env[name]
  if (raw == null || raw === '') return fallback
  if (raw === '1' || raw.toLowerCase() === 'true') return true
  if (raw === '0' || raw.toLowerCase() === 'false') return false
  throw new Error(`${name} must be true/false/1/0 when provided`)
}

export function loadConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL ?? ''
  const cookieSecret = env.COOKIE_SECRET ?? ''

  return {
    host: env.HOST || DEFAULT_HOST,
    port: parseIntegerEnv(env, 'PORT', DEFAULT_PORT),
    databaseUrl,
    cookieSecret,
    sessionTtlHours: parseIntegerEnv(env, 'SESSION_TTL_HOURS', DEFAULT_SESSION_TTL_HOURS),
    queuePollMs: parseIntegerEnv(env, 'QUEUE_POLL_MS', DEFAULT_QUEUE_POLL_MS),
    defaultMatchTickCap: parseIntegerEnv(env, 'DEFAULT_MATCH_TICK_CAP', DEFAULT_MATCH_TICK_CAP),
    runWorker: parseBooleanEnv(env, 'RUN_MATCH_WORKER', true),
    logLevel: env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  }
}
