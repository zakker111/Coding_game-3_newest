import { buildApp } from './app.js'
import { getServerConfig } from './config.js'

const config = getServerConfig()
const app = await buildApp({ config })

try {
  await app.listen({ host: config.host, port: config.port })
  console.log(`Server listening at http://${config.host}:${config.port}`)
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
