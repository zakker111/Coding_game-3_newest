import pg from 'pg'

const { Pool } = pg

export function createPool(config) {
  if (!config.databaseUrl) {
    return null
  }

  return new Pool({
    connectionString: config.databaseUrl,
  })
}

export async function closePool(pool) {
  if (!pool) return
  await pool.end()
}
