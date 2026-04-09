function mapDailyRunRow(row) {
  if (!row) return null

  return {
    id: row.id,
    run_date: row.run_date,
    ruleset_version: row.ruleset_version,
    run_seed: row.run_seed,
    status: row.status,
    created_at: row.created_at,
  }
}

export async function createDailyRun(db, { id, runDate, rulesetVersion, runSeed, status }) {
  const result = await db.query(
    `
      insert into daily_runs (
        id,
        run_date,
        ruleset_version,
        run_seed,
        status
      )
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [id, runDate, rulesetVersion, runSeed, status],
  )

  return mapDailyRunRow(result.rows[0])
}
