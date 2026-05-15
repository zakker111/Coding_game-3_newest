const DEFAULT_MAX_TICK_CAP = 600
const DEFAULT_MAX_SOURCE_CHARS = 12000
const DEFAULT_MAX_SOURCE_LINES = 400
const DEFAULT_BODY_LIMIT = 262144
const DEFAULT_DATA_FILE = '.nowt/server-state.json'
const DEFAULT_MAX_MATCHES_PER_RUN = 100
const DEFAULT_RANKED_ACTIVE_LIMIT = 20
const DEFAULT_DAILY_RUN_INTERVAL_MINUTES = 0

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
    dataFilePath: env.NOWT_SERVER_DATA_FILE || DEFAULT_DATA_FILE,
    maxMatchesPerRun: parseIntEnv(
      env.NOWT_SERVER_MAX_MATCHES_PER_RUN,
      DEFAULT_MAX_MATCHES_PER_RUN,
      'NOWT_SERVER_MAX_MATCHES_PER_RUN'
    ),
    rankedActiveLimit: parseIntEnv(
      env.NOWT_SERVER_RANKED_ACTIVE_LIMIT,
      DEFAULT_RANKED_ACTIVE_LIMIT,
      'NOWT_SERVER_RANKED_ACTIVE_LIMIT'
    ),
    dailyRunIntervalMinutes: parseIntEnv(
      env.NOWT_SERVER_DAILY_RUN_INTERVAL_MINUTES,
      DEFAULT_DAILY_RUN_INTERVAL_MINUTES,
      'NOWT_SERVER_DAILY_RUN_INTERVAL_MINUTES'
    ),
  }

  return Object.freeze(config)
}
