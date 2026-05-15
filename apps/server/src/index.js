import { buildApp } from './app.js'
import { getServerConfig } from './config.js'
import { createJsonDatabase } from './store/jsonDatabase.js'

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
} catch (error) {
  app.log.error(error)
  console.error(error)
  process.exitCode = 1
}

if (config.dailyRunIntervalMinutes > 0) {
  const intervalMs = config.dailyRunIntervalMinutes * 60 * 1000
  console.log(`Auto daily runs enabled: every ${config.dailyRunIntervalMinutes} minute(s)`)

  function runScheduledDaily() {
    const today = new Date().toISOString().slice(0, 10)
    try {
      app.dailyRunService.createRun({
        runDate: today,
        seed: `daily:${today}:${Date.now()}`,
        tickCap: 120,
        maxRounds: 1,
      })
      console.log(`[auto-daily] Completed scheduled daily run for ${today}`)
    } catch (error) {
      console.error(`[auto-daily] Failed:`, error?.message ?? error)
    }
  }

  runScheduledDaily()
  setInterval(runScheduledDaily, intervalMs)
}
