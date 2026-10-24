// Recompute every ranked bot's rating from the stored daily match results.
//
//   node src/tools/recomputeRatings.js --dry-run   print the new ratings, write nothing
//   node src/tools/recomputeRatings.js             write the new ratings to the bot records
//
// Uses the same storage settings as the server (DATABASE_URL + DATABASE_SSL, or
// NOWT_SERVER_DATA_FILE for the JSON file). Stop the game server first so it does not
// overwrite the new ratings with its in-memory copy on its next save.
import { fileURLToPath } from 'node:url'
import { getServerConfig } from '../config.js'
import { createJsonDatabase } from '../store/jsonDatabase.js'
import { createFileStorage } from '../store/fileStorage.js'
import { createPostgresStorage } from '../store/postgresStorage.js'
import { applyMatchesToRatings, defaultRatingState, ratingFields } from '../services/rating.js'

function matchOrderKey(match) {
  return `${match.createdAt ?? ''}\u0000${match.matchId ?? ''}`
}

// Pure: takes stored daily matches (any order) and returns Map botId -> rating state
// for every bot that played. Matches are applied in createdAt, then matchId, order.
export function recomputeRatings(matches) {
  const ordered = [...matches]
    .filter((match) => match && match.kind === 'daily' && match.result)
    .sort((a, b) => (matchOrderKey(a) < matchOrderKey(b) ? -1 : matchOrderKey(a) > matchOrderKey(b) ? 1 : 0))
  return applyMatchesToRatings(ordered)
}

export function runRecompute({ database, dryRun }) {
  const matches = database.matchStore.listMatches({ kind: 'daily' })
  const states = recomputeRatings(matches)
  const rows = database.botStore
    .listBots()
    .filter((bot) => bot.ownerUsername !== 'builtin')
    .map((bot) => {
      const state = states.get(bot.botId) ?? defaultRatingState()
      return { bot, state }
    })

  if (!dryRun) {
    for (const { bot, state } of rows) {
      database.botStore.updateRankedStatus(bot.ownerUsername, bot.name, {
        rating: state.rating,
        ratingDeviation: state.ratingDeviation,
        ratingMatches: state.ratingMatches,
      })
    }
  }

  return {
    matchCount: matches.length,
    rows: rows
      .map(({ bot, state }) => ({ botId: bot.botId, ...ratingFields(state) }))
      .sort((a, b) => b.rating - a.rating || a.botId.localeCompare(b.botId)),
    written: !dryRun,
  }
}

async function main(argv, env = process.env) {
  const dryRun = argv.includes('--dry-run')
  const config = getServerConfig(env)
  const storage = config.databaseUrl
    ? await createPostgresStorage({
        connectionString: config.databaseUrl,
        ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
        log: console,
      })
    : createFileStorage(config.dataFilePath)
  const database = createJsonDatabase({ storage })
  try {
    const result = runRecompute({ database, dryRun })
    console.log(`Daily matches read: ${result.matchCount}`)
    for (const row of result.rows) {
      console.log(
        `${row.botId.padEnd(40)} rating ${row.rating.toFixed(1).padStart(8)}  rd ${row.ratingDeviation.toFixed(1).padStart(6)}  matches ${String(row.ratingMatches).padStart(4)}${row.provisional ? '  (provisional)' : ''}`
      )
    }
    console.log(result.written ? `Wrote ratings for ${result.rows.length} bots.` : 'Dry run: nothing written.')
  } finally {
    await database.close()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
