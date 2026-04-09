export async function createUser(db, { id, username, passwordHash }) {
  const result = await db.query(
    `
      insert into users (id, username, password_hash)
      values ($1, $2, $3)
      returning id, username, created_at
    `,
    [id, username, passwordHash],
  )

  return result.rows[0] ?? null
}

export async function findUserByUsername(db, username) {
  const result = await db.query(
    `
      select id, username, password_hash, created_at
      from users
      where username = $1
      limit 1
    `,
    [username],
  )

  return result.rows[0] ?? null
}

export async function findUserById(db, userId) {
  const result = await db.query(
    `
      select id, username, created_at
      from users
      where id = $1
      limit 1
    `,
    [userId],
  )

  return result.rows[0] ?? null
}
