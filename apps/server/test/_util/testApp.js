import { newDb } from 'pg-mem'

import { RULESET_VERSION } from '@coding-game/ruleset'

import { createApp } from '../../src/app.js'
import { loadConfig } from '../../src/config.js'
import { runMigrations } from '../../src/db/migrate.js'
import { seedBuiltinBots } from '../../src/db/seedBuiltins.js'

export async function createTestApp() {
  const memoryDb = newDb()
  const { Pool } = memoryDb.adapters.createPg()
  const db = new Pool()

  await runMigrations(db)
  await seedBuiltinBots(db)

  const app = await createApp({
    config: loadConfig({
      HOST: '127.0.0.1',
      PORT: '3001',
      LOG_LEVEL: 'silent',
      COOKIE_SECRET: 'test-secret',
      RUN_MATCH_WORKER: 'false',
    }),
    db,
    services: {
      rulesetVersion: RULESET_VERSION,
    },
  })

  return {
    app,
    db,
    async close() {
      await app.close()
      await db.end()
    },
  }
}
