import pg from 'pg'

import { createFileStorage } from './fileStorage.js'

// One row per record: (collection, id, data jsonb). Counters live in the '_meta' collection.
// Only records that changed since the last write are upserted; removed records are deleted.
const RECORD_COLLECTIONS = {
  users: (record) => record.id,
  sessions: (record) => record.sessionId,
  bots: (record) => `${record.ownerUsername}/${record.name}`,
  matches: (record) => record.matchId,
  dailyRuns: (record) => record.runId,
}
const META_COLLECTION = '_meta'
const COUNTERS_ID = 'counters'
const COUNTER_FIELDS = ['nextUserId', 'nextMatchId']

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nowt_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
)`

function emptyIndex() {
  const index = {}
  for (const name of Object.keys(RECORD_COLLECTIONS)) index[name] = new Map()
  index[META_COLLECTION] = new Map()
  return index
}

function countersOf(state) {
  const counters = {}
  for (const field of COUNTER_FIELDS) counters[field] = state[field]
  return counters
}

// Builds a state object (same shape as the JSON file) from rows.
function stateFromRows(rows) {
  const state = { version: 1, nextUserId: 1, nextMatchId: 1, users: [], sessions: [], bots: [], matches: [], dailyRuns: [] }
  for (const row of rows) {
    if (row.collection === META_COLLECTION) {
      if (row.id === COUNTERS_ID) Object.assign(state, row.data)
      continue
    }
    if (state[row.collection]) state[row.collection].push(row.data)
  }
  return state
}

async function readRows(client) {
  const { rows } = await client.query('SELECT collection, id, data FROM nowt_records')
  return rows
}

export async function createPostgresStorage({ connectionString, ssl, importFromFile = null, log = console } = {}) {
  if (typeof connectionString !== 'string' || connectionString.trim() === '') {
    throw new Error('createPostgresStorage requires a connectionString')
  }

  const pool = new pg.Pool({ connectionString, ssl: ssl ?? undefined, max: 4 })
  await pool.query(SCHEMA_SQL)

  const existingRows = await readRows(pool)
  let initialState = existingRows.length > 0 ? stateFromRows(existingRows) : null

  // First start on an empty database: import the JSON file if one exists.
  let imported = false
  if (!initialState && importFromFile) {
    const fileStorage = createFileStorage(importFromFile)
    const fromFile = fileStorage.load()
    if (fromFile) {
      initialState = fromFile
      imported = true
      log.log?.(`Importing existing state from ${importFromFile} into Postgres`)
    }
  }

  // `intended` is the snapshot we have queued to be written. Diffs are taken against it,
  // so a write that is still in flight is never repeated. After a failed write we cannot know
  // what the database holds (rows removed in memory may still be there), so the next save
  // replaces the whole database contents instead of diffing.
  let intended = emptyIndex()
  let needsFullSync = false
  let writeChain = Promise.resolve()

  function indexState(state) {
    const index = emptyIndex()
    for (const [name, keyOf] of Object.entries(RECORD_COLLECTIONS)) {
      for (const record of state[name] ?? []) {
        index[name].set(keyOf(record), JSON.stringify(record))
      }
    }
    index[META_COLLECTION].set(COUNTERS_ID, JSON.stringify(countersOf(state)))
    return index
  }

  if (initialState && !imported) {
    intended = indexState(initialState)
  }

  function diff(state) {
    const next = indexState(state)
    if (needsFullSync) {
      const all = []
      for (const name of Object.keys(next)) {
        for (const [id, json] of next[name]) all.push({ collection: name, id, json })
      }
      return { changes: all, next, full: true }
    }
    const changes = []
    for (const name of Object.keys(next)) {
      const before = intended[name] ?? new Map()
      for (const [id, json] of next[name]) {
        if (before.get(id) !== json) changes.push({ collection: name, id, json })
      }
      for (const id of before.keys()) {
        if (!next[name].has(id)) changes.push({ collection: name, id, json: null })
      }
    }
    return { changes, next, full: false }
  }

  async function applyChanges(changes, full) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (full) await client.query('DELETE FROM nowt_records')
      for (const change of changes) {
        if (change.json === null) {
          await client.query('DELETE FROM nowt_records WHERE collection = $1 AND id = $2', [change.collection, change.id])
        } else {
          await client.query(
            `INSERT INTO nowt_records (collection, id, data, updated_at)
             VALUES ($1, $2, $3::jsonb, now())
             ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [change.collection, change.id, change.json]
          )
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  const storage = {
    load() {
      return initialState
    },

    save(state) {
      const { changes, next, full } = diff(state)
      if (changes.length === 0 && !full) return writeChain
      intended = next
      needsFullSync = false
      writeChain = writeChain.then(() =>
        applyChanges(changes, full).catch((error) => {
          log.error?.('Failed to write game state to Postgres; the next save will replace all stored data', error)
          needsFullSync = true
        })
      )
      return writeChain
    },

    flush() {
      return writeChain
    },

    async close() {
      await writeChain
      await pool.end()
    },
  }

  if (imported) storage.save(initialState)
  return storage
}
