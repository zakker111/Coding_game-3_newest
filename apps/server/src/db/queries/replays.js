function mapReplayRow(row) {
  if (!row) return null

  return {
    match_id: row.match_id,
    encoding: row.encoding,
    sha256: row.sha256,
    replay_base64: row.replay_base64 ?? null,
    replay_bytes: row.replay_bytes ?? null,
    created_at: row.created_at,
  }
}

export async function upsertReplayBlob(db, { matchId, encoding, sha256, replayBytes }) {
  const result = await db.query(
    `
      insert into replay_blobs (
        match_id,
        encoding,
        sha256,
        replay_bytes
      )
      values ($1, $2, $3, $4)
      on conflict (match_id) do update
      set
        encoding = excluded.encoding,
        sha256 = excluded.sha256,
        replay_bytes = excluded.replay_bytes
      returning *
    `,
    [matchId, encoding, sha256, Buffer.from(replayBytes.toString('base64'), 'utf8')],
  )

  return mapReplayRow(result.rows[0])
}

export async function getReplayBlobByMatchId(db, matchId) {
  const result = await db.query('select * from replay_blobs where match_id = $1 limit 1', [matchId])
  return mapReplayRow(result.rows[0])
}
