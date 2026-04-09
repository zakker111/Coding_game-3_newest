function decodeJsonColumn(value) {
  if (value == null) return value
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function mapMatchRow(row) {
  if (!row) return null

  return {
    id: row.id,
    kind: row.kind,
    daily_run_id: row.daily_run_id,
    requested_by_user_id: row.requested_by_user_id,
    match_seed: row.match_seed,
    tick_cap: row.tick_cap,
    status: row.status,
    participants: decodeJsonColumn(row.participants_json),
    result: decodeJsonColumn(row.result_json),
    error: decodeJsonColumn(row.error_json),
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  }
}

export async function createMatch(db, { id, kind, dailyRunId = null, requestedByUserId = null, matchSeed, tickCap, participants }) {
  const result = await db.query(
    `
      insert into matches (
        id,
        kind,
        daily_run_id,
        requested_by_user_id,
        match_seed,
        tick_cap,
        status,
        participants_json
      )
      values ($1, $2, $3, $4, $5, $6, 'queued', $7::jsonb)
      returning *
    `,
    [id, kind, dailyRunId, requestedByUserId, String(matchSeed), tickCap, JSON.stringify(participants)],
  )

  return mapMatchRow(result.rows[0])
}

export async function getMatchById(db, matchId) {
  const result = await db.query('select * from matches where id = $1 limit 1', [matchId])
  return mapMatchRow(result.rows[0])
}

async function claimWithSkipLocked(db) {
  const result = await db.query(`
    with next_match as (
      select id
      from matches
      where status = 'queued'
      order by created_at asc
      for update skip locked
      limit 1
    )
    update matches m
    set status = 'running', started_at = now()
    from next_match
    where m.id = next_match.id
    returning m.*
  `)

  return mapMatchRow(result.rows[0])
}

async function claimWithoutSkipLocked(db) {
  const result = await db.query(`
    update matches
    set status = 'running', started_at = now()
    where id = (
      select id
      from matches
      where status = 'queued'
      order by created_at asc
      limit 1
    )
    and status = 'queued'
    returning *
  `)

  return mapMatchRow(result.rows[0])
}

export async function claimNextQueuedMatch(db) {
  try {
    return await claimWithSkipLocked(db)
  } catch (error) {
    if (!/skip locked|for update/i.test(String(error?.message ?? ''))) {
      throw error
    }
    return claimWithoutSkipLocked(db)
  }
}

export async function markMatchComplete(db, matchId, result) {
  const queryResult = await db.query(
    `
      update matches
      set
        status = 'complete',
        result_json = $2::jsonb,
        completed_at = now()
      where id = $1
      returning *
    `,
    [matchId, JSON.stringify(result)],
  )

  return mapMatchRow(queryResult.rows[0])
}

export async function markMatchFailed(db, matchId, errorMetadata) {
  const result = await db.query(
    `
      update matches
      set
        status = 'failed',
        error_json = $2::jsonb,
        completed_at = now()
      where id = $1
      returning *
    `,
    [matchId, JSON.stringify(errorMetadata)],
  )

  return mapMatchRow(result.rows[0])
}
