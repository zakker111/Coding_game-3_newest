import { buildApp } from './app.js'
import { getServerConfig } from './config.js'
import { createPersistentStoreBundle } from './store/persistentStoreBundle.js'

const config = getServerConfig()
const stores = createPersistentStoreBundle({
  filePath: config.dataFilePath,
})
const app = await buildApp({
  config,
  store: stores.matchStore,
  botStore: stores.botStore,
  dailyRunStore: stores.dailyRunStore,
  userStore: stores.userStore,
})

try {
  await app.listen({ host: config.host, port: config.port })
  console.log(`Server listening at http://${config.host}:${config.port}`)
} catch (error) {
  app.log.error(error)
  console.error(error)
  process.exitCode = 1
}
