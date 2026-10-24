import { buildApp } from './app.js'
import { getServerConfig } from './config.js'
import { createJsonDatabase } from './store/jsonDatabase.js'
import { parseDailyRunHour, startDailyRunScheduler } from './dailyRunScheduler.js'

const config = getServerConfig()
const database = createJsonDatabase({
  filePath: config.dataFilePath,
})
const app = await buildApp({
  config,
  store: database.matchStore,
  botStore: database.botStore,
  userStore: database.userStore,
  dailyRunStore: database.dailyRunStore,
})

try {
  await app.listen({ host: config.host, port: config.port })
  console.log(`Server listening at http://${config.host}:${config.port}`)
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
