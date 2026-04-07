const DEFAULT_MAX_TICK_CAP = 600
const DEFAULT_MAX_SOURCE_CHARS = 12000
const DEFAULT_MAX_SOURCE_LINES = 400
const DEFAULT_BODY_LIMIT = 262144

function parseIntEnv(value, fallback, name) {
  if (value == null || value === '') return fallback
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: expected a non-negative integer`)
  }
  return parsed
}

export function getServerConfig(env = process.env) {
  const config = {
    host: env.HOST || '127.0.0.1',
    port: parseIntEnv(env.PORT, 3000, 'PORT'),
    maxTickCap: parseIntEnv(env.NOWT_SERVER_MAX_TICK_CAP, DEFAULT_MAX_TICK_CAP, 'NOWT_SERVER_MAX_TICK_CAP'),
    maxSourceChars: parseIntEnv(
      env.NOWT_SERVER_MAX_SOURCE_CHARS,
      DEFAULT_MAX_SOURCE_CHARS,
      'NOWT_SERVER_MAX_SOURCE_CHARS'
    ),
    maxSourceLines: parseIntEnv(
      env.NOWT_SERVER_MAX_SOURCE_LINES,
      DEFAULT_MAX_SOURCE_LINES,
      'NOWT_SERVER_MAX_SOURCE_LINES'
    ),
    bodyLimit: parseIntEnv(env.NOWT_SERVER_BODY_LIMIT, DEFAULT_BODY_LIMIT, 'NOWT_SERVER_BODY_LIMIT'),
  }

  return Object.freeze(config)
}
