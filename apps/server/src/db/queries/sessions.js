export async function createSession(db, { id, userId, tokenHash, expiresAt }) {
  const result = await db.query(
    `
      insert into sessions (id, user_id, token_hash, expires_at)
      values ($1, $2, $3, $4)
      returning id, user_id, expires_at, created_at
    `,
    [id, userId, tokenHash, expiresAt],
  )

  return result.rows[0] ?? null
}

export async function deleteSessionByTokenHash(db, tokenHash) {
  await db.query('delete from sessions where token_hash = $1', [tokenHash])
}

export async function findSessionUserByTokenHash(db, tokenHash) {
  const result = await db.query(
    `
      select
        s.id as session_id,
        s.user_id,
        s.expires_at,
        u.username
      from sessions s
      join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.expires_at > now()
      limit 1
    `,
    [tokenHash],
  )

  return result.rows[0] ?? null
}
