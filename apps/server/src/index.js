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
