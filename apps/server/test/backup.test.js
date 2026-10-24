import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

import { exportDatabase, parseBackup, restoreDatabase } from '../src/tools/backup.js'

// Runs only with a scratch database, e.g.
//   TEST_DATABASE_URL=postgres://nowt:nowt@localhost:5432/nowt_test node --test
const url = process.env.TEST_DATABASE_URL
const skip = url ? false : 'set TEST_DATABASE_URL to run the backup test'

async function withClient(fn) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

test('backup export then restore round-trips every record', { skip }, async () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 })
  const dir = mkdtempSync(join(tmpdir(), 'nowt-backup-'))
  const file = join(dir, 'backup.json')
  try {
    await withClient((c) => c.query('DROP TABLE IF EXISTS nowt_records'))
    await pool.query(`CREATE TABLE nowt_records (collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))`)
    await pool.query("INSERT INTO nowt_records (collection, id, data) VALUES ('users','u1','{\"username\":\"a\"}'), ('_meta','counters','{\"nextUserId\":2}')")

    const exported = await exportDatabase({ pool, outFile: file })
    assert.equal(exported.recordCount, 2)
    const backup = parseBackup(readFileSync(file, 'utf8'))
    assert.equal(backup.records.length, 2)

    await pool.query('DELETE FROM nowt_records')
    const restored = await restoreDatabase({ pool, inFile: file, replace: true })
    assert.equal(restored.recordCount, 2)

    const { rows } = await pool.query('SELECT collection, id, data FROM nowt_records ORDER BY collection, id')
    assert.deepEqual(rows.map((r) => [r.collection, r.id, r.data]), [
      ['_meta', 'counters', { nextUserId: 2 }],
      ['users', 'u1', { username: 'a' }],
    ])
  } finally {
    await pool.end()
  }
})

test('restore refuses without replace and rejects non-backup files', { skip }, async () => {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const dir = mkdtempSync(join(tmpdir(), 'nowt-backup-'))
  const bad = join(dir, 'bad.json')
  writeFileSync(bad, JSON.stringify({ hello: 'world' }))
  try {
    await assert.rejects(restoreDatabase({ pool, inFile: bad, replace: false }), /Refusing to restore/)
    await assert.rejects(restoreDatabase({ pool, inFile: bad, replace: true }), /Not a nowt-backup/)
  } finally {
    await pool.end()
  }
})
