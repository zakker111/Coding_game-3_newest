import { buildApp } from './app.js'
import { getServerConfig } from './config.js'
import { createJsonDatabase } from './store/jsonDatabase.js'
import { createFileStorage } from './store/fileStorage.js'
import { createPostgresStorage } from './store/postgresStorage.js'
import { parseDailyRunHour, startDailyRunScheduler } from './dailyRunScheduler.js'

const config = getServerConfig()

const storage = config.databaseUrl
  ? await createPostgresStorage({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      importFromFile: config.dataFilePath,
      log: console,
    })
  : createFileStorage(config.dataFilePath)

const database = createJsonDatabase({ storage })
const app = await buildApp({
  config,
  store: database.matchStore,
  botStore: database.botStore,
  userStore: database.userStore,
  dailyRunStore: database.dailyRunStore,
})

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received: flushing game state and stopping`)
  try {
    await app.close()
    await database.close()
  } catch (error) {
    console.error('Error during shutdown', error)
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ host: config.host, port: config.port })
  console.log(
    `Server listening at http://${config.host}:${config.port} (storage: ${config.databaseUrl ? 'Postgres' : 'JSON file ' + config.dataFilePath})`
  )
  const dailyRunHour = parseDailyRunHour(process.env.NOWT_DAILY_RUN_HOUR_UTC)
  if (dailyRunHour !== null) {
    startDailyRunScheduler({ dailyRunService: app.dailyRunService, hour: dailyRunHour, log: console })
    console.log(`Daily league scheduled once a day at ${String(dailyRunHour).padStart(2, '0')}:00 UTC`)
  }
} catch (error) {
  app.log.error(error)
  console.error(error)
  process.exitCode = 1
}
