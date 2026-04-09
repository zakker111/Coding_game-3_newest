function mapVersionRow(row) {
  if (!row) return null

  return {
    id: row.id,
    bot_id: row.bot_id,
    source_hash: row.source_hash,
    source_text: row.source_text,
    loadout_snapshot: typeof row.loadout_snapshot === 'string' ? JSON.parse(row.loadout_snapshot) : row.loadout_snapshot,
    save_message: row.save_message,
    created_at: row.created_at,
  }
}

export async function insertBotVersion(db, { id, botRowId, sourceHash, sourceText, loadoutSnapshot, saveMessage = null }) {
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
    [id, botRowId, sourceHash, sourceText, JSON.stringify(loadoutSnapshot), saveMessage],
  )
}

export async function listBotVersions(db, botRowId) {
  const result = await db.query(
    `
      select bot_id, source_hash, save_message, created_at
      from bot_versions
      where bot_id = $1
      order by created_at desc
    `,
    [botRowId],
  )

  return result.rows.map((row) => ({
    bot_id: row.bot_id,
    source_hash: row.source_hash,
    save_message: row.save_message,
    created_at: row.created_at,
  }))
}

export async function getBotVersionSource(db, botRowId, sourceHash) {
  const result = await db.query(
    `
      select *
      from bot_versions
      where bot_id = $1 and source_hash = $2
      limit 1
    `,
    [botRowId, sourceHash],
  )

  return mapVersionRow(result.rows[0])
}
