import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDeployFiles, syncDeployFiles } from './deploySync.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const args = new Set(process.argv.slice(2))

if (args.has('--check')) {
  await checkDeployFiles(repoRoot)
} else {
  await syncDeployFiles(repoRoot)
}
