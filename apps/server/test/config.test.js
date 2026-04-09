import test from 'node:test'
import assert from 'node:assert/strict'

import { loadConfig } from '../src/config.js'

test('loadConfig reads explicit env values from the provided object', () => {
  const config = loadConfig({
    HOST: '0.0.0.0',
    PORT: '4010',
    SESSION_TTL_HOURS: '48',
    QUEUE_POLL_MS: '250',
    DEFAULT_MATCH_TICK_CAP: '700',
    RUN_MATCH_WORKER: 'false',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://example/db',
    COOKIE_SECRET: 'secret',
  })

  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.port, 4010)
  assert.equal(config.sessionTtlHours, 48)
  assert.equal(config.queuePollMs, 250)
  assert.equal(config.defaultMatchTickCap, 700)
  assert.equal(config.runWorker, false)
  assert.equal(config.logLevel, 'silent')
  assert.equal(config.databaseUrl, 'postgres://example/db')
  assert.equal(config.cookieSecret, 'secret')
})
