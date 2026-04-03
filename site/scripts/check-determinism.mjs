import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const generatorPath = path.join(__dirname, 'generate-mock-replay.mjs')

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function runOnce() {
  return execFileSync(process.execPath, [generatorPath, '--seed', '12345'], {
    encoding: 'utf8',
  })
}

const out1 = runOnce()
const out2 = runOnce()

const h1 = sha256(out1)
const h2 = sha256(out2)

if (h1 !== h2 || out1 !== out2) {
  console.error('Non-deterministic generator output detected')
  console.error(`hash1=${h1}`)
  console.error(`hash2=${h2}`)
  process.exit(1)
}

console.log(h1)
