import test from 'node:test'
import assert from 'node:assert/strict'

import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { RULESET_VERSION } from '@coding-game/ruleset'

test('GET /api/ruleset returns the authoritative ruleset metadata', async (t) => {
  const app = await createApp({
    config: loadConfig({
      PORT: '3001',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'silent',
    }),
    db: null,
    services: {
      rulesetVersion: RULESET_VERSION,
    },
  })

  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/ruleset',
  })

  assert.equal(response.statusCode, 200)

  const body = response.json()
  assert.equal(body.rulesetVersion, RULESET_VERSION)
  assert.equal(body.loadoutSlotCount, 3)
  assert.equal(Array.isArray(body.modules), true)
  assert.equal(body.modules.length >= 4, true)
})
