function decodeJsonColumn(value) {
  if (value == null) return value
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function mapBotRow(row) {
  if (!row) return null

  return {
    id: row.id,
    user_id: row.user_id,
    owner_username: row.owner_username,
    name: row.name,
    botId: row.bot_id,
    source_text: row.source_text,
    source_hash: row.source_hash,
    loadout: decodeJsonColumn(row.latest_loadout),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function countBotsForUser(db, userId) {
  const result = await db.query('select count(*)::int as count from bots where user_id = $1', [userId])
  return result.rows[0]?.count ?? 0
}

export async function createBot(db, { id, userId, ownerUsername, name, botId, sourceText, sourceHash, latestLoadout }) {
  const result = await db.query(
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
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning *
    `,
    [id, userId, ownerUsername, name, botId, sourceText, sourceHash, JSON.stringify(latestLoadout)],
  )

  return mapBotRow(result.rows[0])
}

export async function updateBotSource(db, { ownerUsername, name, sourceText, sourceHash, latestLoadout }) {
  const result = await db.query(
    `
      update bots
      set
        source_text = $3,
        source_hash = $4,
        latest_loadout = $5::jsonb,
        updated_at = now()
      where owner_username = $1 and name = $2
      returning *
    `,
    [ownerUsername, name, sourceText, sourceHash, JSON.stringify(latestLoadout)],
  )

  return mapBotRow(result.rows[0])
}

export async function getBotByOwnerAndName(db, ownerUsername, name) {
  const result = await db.query(
    `
      select *
      from bots
      where owner_username = $1 and name = $2
      limit 1
    `,
    [ownerUsername, name],
  )

  return mapBotRow(result.rows[0])
}

export async function listVisibleBots(db, { viewerUsername = null, owner = null, query = '' } = {}) {
  const values = []
  const filters = []

  if (viewerUsername) {
    values.push(viewerUsername)
    filters.push(`(owner_username = 'builtin' or owner_username = $${values.length})`)
  } else {
    filters.push(`owner_username = 'builtin'`)
  }

  if (owner) {
    values.push(owner)
    filters.push(`owner_username = $${values.length}`)
  }

  if (query) {
    values.push(`%${String(query).toLowerCase()}%`)
    filters.push(`(lower(name) like $${values.length} or lower(bot_id) like $${values.length})`)
  }

  const whereSql = filters.length ? `where ${filters.join(' and ')}` : ''
  const result = await db.query(
    `
      select *
      from bots
      ${whereSql}
      order by owner_username asc, name asc
    `,
    values,
  )

  return result.rows.map(mapBotRow)
}
