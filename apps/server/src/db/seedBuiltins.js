import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { compileBotSource } from '@coding-game/engine'

import { loadConfig } from '../config.js'
import { loadBuiltinBots } from '../lib/builtinBots.js'
import { createPool, closePool } from './pool.js'

const __filename = fileURLToPath(import.meta.url)

export async function seedBuiltinBots(db) {
  const builtins = await loadBuiltinBots()

  await db.query('begin')

  try {
    for (const builtin of builtins) {
      const compile = compileBotSource(builtin.sourceText)
      if (compile.errors.length > 0) {
        throw new Error(`Built-in bot ${builtin.botId} failed to compile: ${JSON.stringify(compile.errors)}`)
      }

      const upsertResult = await db.query(
        `
          insert into bots (
            id,
            user_id,
            owner_username,
            name,
            bot_id,
            source_text,
            source_hash,
            latest_loadout
          )
          values ($1, null, $2, $3, $4, $5, $6, $7::jsonb)
          on conflict (bot_id) do update
          set
            owner_username = excluded.owner_username,
            name = excluded.name,
            source_text = excluded.source_text,
            source_hash = excluded.source_hash,
            latest_loadout = excluded.latest_loadout,
            updated_at = now()
          returning id
        `,
        [randomUUID(), builtin.ownerUsername, builtin.name, builtin.botId, builtin.sourceText, builtin.sourceHash, JSON.stringify(builtin.loadout)],
      )

      const botRowId = upsertResult.rows[0]?.id
      if (!botRowId) {
        throw new Error(`Failed to upsert built-in bot ${builtin.botId}`)
      }

      await db.query(
        `
          insert into bot_versions (
            id,
            bot_id,
            source_hash,
            source_text,
            loadout_snapshot,
            save_message
          )
          values ($1, $2, $3, $4, $5::jsonb, $6)
          on conflict (bot_id, source_hash) do nothing
        `,
        [randomUUID(), botRowId, builtin.sourceHash, builtin.sourceText, JSON.stringify(builtin.loadout), 'Built-in seed'],
      )
    }

    await db.query('commit')
    return builtins.length
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

async function main() {
  const config = loadConfig()
  const pool = createPool(config)

  if (!pool) {
    throw new Error('DATABASE_URL is required to seed built-in bots')
  }

  try {
    const count = await seedBuiltinBots(pool)
    console.log(`Seeded ${count} built-in bots`)
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
