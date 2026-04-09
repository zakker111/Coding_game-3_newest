function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

function sortStandings(entries) {
  return [...entries].sort((a, b) => {
    if (a.seasonPoints !== b.seasonPoints) return b.seasonPoints - a.seasonPoints
    if (a.activeForNextRun !== b.activeForNextRun) return Number(b.activeForNextRun) - Number(a.activeForNextRun)
    return a.botId.localeCompare(b.botId)
  })
}

export function createInMemoryDailyRunStore() {
  const seasons = new Map()
  const runs = new Map()
  let nextRunId = 1

  function requireSeason(seasonId) {
    const season = seasons.get(seasonId)
    if (!season) {
      throw new Error(`Unknown season: ${seasonId}`)
    }
    return season
  }

  function requireRun(runId) {
    const run = runs.get(runId)
    if (!run) {
      throw new Error(`Unknown daily run: ${runId}`)
    }
    return run
  }

  function getStandingEntry(season, botId) {
    return season.standings.find((entry) => entry.botId === botId) ?? null
  }

  return {
    ensureSeason(meta) {
      const existing = seasons.get(meta.seasonId)
      if (existing) return cloneRecord(existing)

      const createdAt = new Date().toISOString()
      const season = {
        createdAt,
        updatedAt: createdAt,
        standings: [],
        ...meta,
      }
      seasons.set(season.seasonId, season)
      return cloneRecord(season)
    },

    getSeason(seasonId) {
      return cloneRecord(seasons.get(seasonId) ?? null)
    },

    listStandings(seasonId) {
      const season = seasons.get(seasonId)
      if (!season) return []
      return cloneRecord(sortStandings(season.standings))
    },

    upsertSeasonBots(seasonId, bots, { initialPoints = 0 } = {}) {
      const season = requireSeason(seasonId)
      let touched = false

      for (const bot of bots) {
        let entry = getStandingEntry(season, bot.botId)
        if (!entry) {
          const timestamp = new Date().toISOString()
          entry = {
            botId: bot.botId,
            ownerUsername: bot.ownerUsername,
            name: bot.name,
            seasonPoints: initialPoints,
            activeForNextRun: true,
            lastActiveRunDate: null,
            lastSourceHash: bot.sourceHash ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
          season.standings.push(entry)
          touched = true
          continue
        }

        if (entry.lastSourceHash !== (bot.sourceHash ?? null)) {
          entry.lastSourceHash = bot.sourceHash ?? null
          entry.updatedAt = new Date().toISOString()
          touched = true
        }
      }

      if (touched) {
        season.updatedAt = new Date().toISOString()
      }

      return cloneRecord(sortStandings(season.standings))
    },

    applyPoints(seasonId, { runDate, pointsByBotId, botSnapshots }) {
      const season = requireSeason(seasonId)
      const timestamp = new Date().toISOString()

      for (const bot of botSnapshots) {
        let entry = getStandingEntry(season, bot.botId)
        if (!entry) {
          entry = {
            botId: bot.botId,
            ownerUsername: bot.ownerUsername,
            name: bot.name,
            seasonPoints: season.rejoinPointsFloor,
            activeForNextRun: true,
            lastActiveRunDate: null,
            lastSourceHash: bot.sourceHash ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
          season.standings.push(entry)
        }

        entry.seasonPoints += pointsByBotId[bot.botId] ?? 0
        entry.lastActiveRunDate = runDate
        entry.lastSourceHash = bot.sourceHash ?? null
        entry.activeForNextRun = entry.seasonPoints >= season.eligiblePointsThreshold
        entry.updatedAt = timestamp
      }

      season.updatedAt = timestamp
      return cloneRecord(sortStandings(season.standings))
    },

    reenableBot(seasonId, bot) {
      const season = requireSeason(seasonId)
      const timestamp = new Date().toISOString()
      let entry = getStandingEntry(season, bot.botId)

      if (!entry) {
        entry = {
          botId: bot.botId,
          ownerUsername: bot.ownerUsername,
          name: bot.name,
          seasonPoints: season.rejoinPointsFloor,
          activeForNextRun: true,
          lastActiveRunDate: null,
          lastSourceHash: bot.sourceHash ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          reenabledAt: timestamp,
        }
        season.standings.push(entry)
      } else {
        entry.activeForNextRun = true
        entry.seasonPoints = Math.max(entry.seasonPoints, season.rejoinPointsFloor)
        entry.lastSourceHash = bot.sourceHash ?? null
        entry.reenabledAt = timestamp
        entry.updatedAt = timestamp
      }

      season.updatedAt = timestamp
      return cloneRecord(entry)
    },

    createRun(meta) {
      const runId = `dr_${String(nextRunId).padStart(6, '0')}`
      nextRunId += 1

      const createdAt = new Date().toISOString()
      const run = {
        runId,
        status: 'planned',
        matchIds: [],
        rounds: [],
        leaderboardSnapshot: [],
        error: null,
        createdAt,
        updatedAt: createdAt,
        ...meta,
      }

      runs.set(runId, run)
      return cloneRecord(run)
    },

    listRuns() {
      const out = [...runs.values()]
      out.sort((a, b) => b.runId.localeCompare(a.runId))
      return cloneRecord(out)
    },

    getRun(runId) {
      return cloneRecord(runs.get(runId) ?? null)
    },

    markRunRunning(runId) {
      const run = requireRun(runId)
      run.status = 'running'
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    appendRunMatch(runId, matchId) {
      const run = requireRun(runId)
      run.matchIds.push(matchId)
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    markRunComplete(runId, payload) {
      const run = requireRun(runId)
      run.status = 'complete'
      run.rounds = payload.rounds
      run.leaderboardSnapshot = payload.leaderboardSnapshot
      run.stopReason = payload.stopReason
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    markRunFailed(runId, error) {
      const run = requireRun(runId)
      run.status = 'failed'
      run.error = error
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },
  }
}
