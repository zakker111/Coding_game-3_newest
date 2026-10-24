// Backup and restore for the Postgres game database.
//
//   node src/tools/backup.js export [outFile]          write all game data to a JSON file
//   node src/tools/backup.js restore <file> --replace  replace ALL game data with the file
//
// Needs DATABASE_URL (and DATABASE_SSL=1 for Render's external URL). Stop the game server
// before a restore, otherwise it will overwrite the restored data on its next save.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nowt_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
)`

export const BACKUP_FORMAT = 'nowt-backup'
export const BACKUP_VERSION = 1

function connect(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const ssl = env.DATABASE_SSL === '1' || env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined
  return new pg.Pool({ connectionString: env.DATABASE_URL, ssl, max: 2 })
}

function defaultOutFile(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return resolve(process.cwd(), 'backups', `nowt-backup-${stamp}.json`)
}

export async function exportDatabase({ pool, outFile = defaultOutFile(), now = new Date() }) {
  await pool.query(SCHEMA_SQL)
  const { rows } = await pool.query('SELECT collection, id, data, updated_at FROM nowt_records ORDER BY collection, id')
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    recordCount: rows.length,
    records: rows.map((row) => ({ collection: row.collection, id: row.id, data: row.data, updatedAt: row.updated_at })),
  }
  const target = resolve(outFile)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(backup, null, 2) + '\n')
  return { file: target, recordCount: rows.length }
}

export function parseBackup(text) {
  const backup = JSON.parse(text)
  if (backup?.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !Array.isArray(backup.records)) {
    throw new Error(`Not a ${BACKUP_FORMAT} v${BACKUP_VERSION} file`)
  }
  for (const record of backup.records) {
    if (typeof record.collection !== 'string' || typeof record.id !== 'string' || record.data == null) {
      throw new Error('Backup contains a malformed record')
    }
  }
  return backup
}

export async function restoreDatabase({ pool, inFile, replace = false }) {
  if (!replace) throw new Error('Refusing to restore without --replace (this deletes all current game data)')
  const backup = parseBackup(await readFile(resolve(inFile), 'utf8'))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(SCHEMA_SQL)
    await client.query('DELETE FROM nowt_records')
    for (const record of backup.records) {
      await client.query('INSERT INTO nowt_records (collection, id, data) VALUES ($1, $2, $3)', [
        record.collection,
        record.id,
        JSON.stringify(record.data),
      ])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { recordCount: backup.records.length, exportedAt: backup.exportedAt }
}

async function main(argv) {
  const [command, ...rest] = argv
  const pool = connect()
  try {
    if (command === 'export') {
      const outFile = rest.find((arg) => !arg.startsWith('--')) ?? undefined
      const result = await exportDatabase({ pool, outFile })
      console.log(`Exported ${result.recordCount} records to ${result.file}`)
    } else if (command === 'restore') {
      const inFile = rest.find((arg) => !arg.startsWith('--'))
      if (!inFile) throw new Error('usage: restore <file> --replace')
      const result = await restoreDatabase({ pool, inFile, replace: rest.includes('--replace') })
      console.log(`Restored ${result.recordCount} records (backup made ${result.exportedAt})`)
    } else {
      throw new Error('usage: node src/tools/backup.js export [outFile] | restore <file> --replace')
    }
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
