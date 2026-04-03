import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fixturesDir = path.join(__dirname, 'fixtures')
const placeholderSha = '__REPLACE_BY_RUNNING_pnpm_golden_update__'
const sha256Re = /^[0-9a-f]{64}$/

// Phase 6 is complete: fixtures are checked in, so `golden:check` is always strict.
const requiredFixtureFiles = [
  'examples_smoke_seed123.json',
  'examples_patrol_seed456.json',
  'modules_powerups_seed999.json',
  'modules_saw_rush_seed777.json',
]

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {any} fixture
 * @param {string} relPath
 */
function validateFixture(fixture, relPath) {
  const errors = []
  const addError = (msg) => errors.push(`${relPath}: ${msg}`)

  if (!isPlainObject(fixture)) {
    addError('fixture must be a JSON object')
    return errors
  }

  if (typeof fixture.name !== 'string') addError('name must be a string')

  if (!isPlainObject(fixture.params)) {
    addError('params must be an object')
  } else {
    const { seed, tickCap, bots } = fixture.params

    if (typeof seed !== 'number' || !Number.isFinite(seed)) addError('params.seed must be a finite number')
    if (!Number.isInteger(tickCap) || tickCap <= 0) addError('params.tickCap must be an integer > 0')
    if (!Array.isArray(bots) || bots.length !== 4) addError('params.bots must be an array of length 4')
  }

  const core = fixture.coreReplaySha256

  if (core === placeholderSha) {
    addError('coreReplaySha256 is a placeholder; run `pnpm golden:update` and commit the generated fixture hashes')
    return errors
  }

  if (typeof core !== 'string') addError('coreReplaySha256 must be a string')
  else if (!sha256Re.test(core)) addError('coreReplaySha256 must be a 64-hex sha256 string')

  const tickCap = fixture?.params?.tickCap
  const expectedLen = Number.isInteger(tickCap) ? tickCap + 1 : null

  for (const key of ['stateTickSha256', 'eventsTickSha256']) {
    const arr = fixture[key]

    if (!Array.isArray(arr)) {
      addError(`${key} must be an array`)
      continue
    }

    if (expectedLen !== null && arr.length !== expectedLen) {
      addError(`${key} must have length tickCap+1 (expected ${expectedLen}, got ${arr.length})`)
      continue
    }

    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'string' || !sha256Re.test(arr[i])) {
        addError(`${key}[${i}] must be a 64-hex sha256 string`)
      }
    }
  }

  return errors
}

const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).sort()

const allErrors = []

if (files.length === 0) {
  allErrors.push('packages/engine/test/golden/fixtures: no fixture JSON files found')
}

for (const required of requiredFixtureFiles) {
  if (!files.includes(required)) {
    allErrors.push(`packages/engine/test/golden/fixtures: missing required fixture file: ${required}`)
  }
}

for (const file of files) {
  const absPath = path.join(fixturesDir, file)
  const relPath = path.join('packages', 'engine', 'test', 'golden', 'fixtures', file)

  let fixture
  try {
    fixture = JSON.parse(await readFile(absPath, 'utf8'))
  } catch (err) {
    allErrors.push(`${relPath}: failed to read/parse JSON (${err?.message ?? String(err)})`)
    continue
  }

  allErrors.push(...validateFixture(fixture, relPath))
}

if (allErrors.length > 0) {
  for (const line of allErrors) process.stderr.write(`${line}\n`)
  process.exit(1)
}
