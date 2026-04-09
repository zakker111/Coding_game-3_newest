import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createPool, closePool } from './db/pool.js'
import { RULESET_VERSION } from '@coding-game/ruleset'
import { startMatchWorker } from './worker/processMatch.js'

async function main() {
  const config = loadConfig()
  const db = createPool(config)

  const app = await createApp({
    config,
    db,
    services: {
      rulesetVersion: RULESET_VERSION,
    },
  })

  const stopWorker = config.runWorker ? startMatchWorker({ config, db, logger: app.log }) : async () => {}

  const shutdown = async () => {
    await stopWorker()
    await app.close()
    await closePool(db)
  }

  process.on('SIGINT', async () => {
    await shutdown()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await shutdown()
    process.exit(0)
  })

  await app.listen({
    host: config.host,
    port: config.port,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
