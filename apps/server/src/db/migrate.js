import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from '../config.js'
import { createPool, closePool } from './pool.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.join(__dirname, 'migrations')

export async function ensureMigrationsTable(db) {
  await db.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

export async function listMigrationFiles(dir = migrationsDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export async function runMigrations(db, dir = migrationsDir) {
  await ensureMigrationsTable(db)

  const appliedResult = await db.query('select name from schema_migrations')
  const applied = new Set(appliedResult.rows.map((row) => row.name))
  const pending = []

  for (const fileName of await listMigrationFiles(dir)) {
    if (applied.has(fileName)) continue

    const sql = await fs.readFile(path.join(dir, fileName), 'utf8')
    await db.query('begin')

    try {
      await db.query(sql)
      await db.query('insert into schema_migrations (name) values ($1)', [fileName])
      await db.query('commit')
      pending.push(fileName)
    } catch (error) {
      await db.query('rollback')
      throw error
    }
  }

  return pending
}

async function main() {
  const config = loadConfig()
  const pool = createPool(config)

  if (!pool) {
    throw new Error('DATABASE_URL is required to run migrations')
  }

  try {
    const applied = await runMigrations(pool)
    if (applied.length) {
      console.log(`Applied migrations: ${applied.join(', ')}`)
    } else {
      console.log('No pending migrations')
    }
  } finally {
    await closePool(pool)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
