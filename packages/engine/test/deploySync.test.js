import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDeployFiles } from '../../../scripts/deploySync.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '../../..')

test('deploy-time copies are in sync with authoritative sources', async () => {
  await checkDeployFiles(repoRoot)
})
