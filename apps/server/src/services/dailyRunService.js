import { LOADOUT_SLOT_COUNT, RULESET_VERSION } from '@coding-game/ruleset'

import { SLOT_IDS, runStoredMatch, summarizeReplayResult } from './matchRunner.js'
import { sha256Hex } from './sourceText.js'

const DEFAULT_MAX_ROUNDS_PER_DAY = 3
const DEFAULT_ELIGIBLE_POINTS_THRESHOLD = 1
const DEFAULT_REJOIN_POINTS_FLOOR = 1
const DEFAULT_PLACEMENT_POINTS = [5, 3, 1, -1]

function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRunDate(value) {
  if (value == null) {
    return new Date().toISOString().slice(0, 10)
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createHttpError(400, 'INVALID_REQUEST', 'runDate must be YYYY-MM-DD', {
      field: 'runDate',
    })
  }

  return value
}

function parseOptionalPositiveInt(value, fallback, field) {
  if (value == null) return fallback
  if (!Number.isInteger(value) || value <= 0) {
    throw createHttpError(400, 'INVALID_REQUEST', `${field} must be a positive integer`, {
      field,
    })
  }
  return value
}

function buildSeasonWindow(runDate) {
  const date = new Date(`${runDate}T00:00:00Z`)
  const day = date.getUTCDay()
  const offsetToMonday = (day + 6) % 7
  const startsAt = new Date(date)
  startsAt.setUTCDate(startsAt.getUTCDate() - offsetToMonday)

  const endsAt = new Date(startsAt)
  endsAt.setUTCDate(endsAt.getUTCDate() + 7)

  return {
    seasonId: `season-${startsAt.toISOString().slice(0, 10)}`,
    startsAt: startsAt.toISOString().slice(0, 10),
    endsAt: endsAt.toISOString().slice(0, 10),
  }
}

function emptyLoadout() {
  return Array.from({ length: LOADOUT_SLOT_COUNT }, () => null)
}

function deterministicOrder(items, seedParts) {
  return [...items].sort((a, b) => {
    const aKey = sha256Hex([...seedParts, a.botId].join(':'))
    const bKey = sha256Hex([...seedParts, b.botId].join(':'))
    return aKey.localeCompare(bKey) || a.botId.localeCompare(b.botId)
  })
}

function deriveMatchSeed(runSeed, roundIndex, matchIndex) {
  const hex = sha256Hex(`${String(runSeed)}:${roundIndex}:${matchIndex}`).slice(0, 8)
  return Number.parseInt(hex, 16)
}

function chunkIntoMatches(bots) {
  const groups = []
  for (let index = 0; index + SLOT_IDS.length <= bots.length; index += SLOT_IDS.length) {
    groups.push(bots.slice(index, index + SLOT_IDS.length))
  }
  return groups
}

function scorePlacements(placements, placementPoints = DEFAULT_PLACEMENT_POINTS) {
  const pointsByBotId = {}

  const scoredPlacements = placements.map((entry) => {
    const occupiedRanks = entry.occupiedRanks?.length ? entry.occupiedRanks : [entry.placement]
    const total = occupiedRanks.reduce((sum, rank) => sum + (placementPoints[rank - 1] ?? 0), 0)
    const pointDelta = total / occupiedRanks.length

    pointsByBotId[entry.botId] = pointDelta

    return {
      ...entry,
      pointDelta,
    }
  })

  return {
    placements: scoredPlacements,
    pointsByBotId,
  }
}

function createDailyResultBuilder() {
  return (replay) => {
    const base = summarizeReplayResult(replay)
    const scored = scorePlacements(base.placements)

    return {
      ...base,
      placements: scored.placements,
      pointsByBotId: scored.pointsByBotId,
    }
  }
}

function requireAuthenticatedOwner(owner, currentUser) {
  if (!currentUser) {
    throw createHttpError(401, 'AUTH_REQUIRED', 'authentication is required to re-enable a bot')
  }

  if (currentUser.username !== owner) {
    throw createHttpError(403, 'FORBIDDEN', 'you can only re-enable bots for the authenticated user', {
      owner,
      authenticatedUsername: currentUser.username,
    })
  }
}

function buildSeasonResponse(season, standings) {
  return {
    season: {
      seasonId: season.seasonId,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      rulesetVersion: season.rulesetVersion,
      eligiblePointsThreshold: season.eligiblePointsThreshold,
      rejoinPointsFloor: season.rejoinPointsFloor,
    },
    standings,
  }
}

export function createDailyRunService({
  dailyRunStore,
  matchStore,
  botStore,
  config = {},
  runMatch,
} = {}) {
  if (!dailyRunStore) {
    throw new Error('createDailyRunService requires a dailyRunStore')
  }
  if (!matchStore) {
    throw new Error('createDailyRunService requires a matchStore')
  }
  if (!botStore) {
    throw new Error('createDailyRunService requires a botStore')
  }

  const maxRoundsPerDay = config.dailyMaxRoundsPerDay ?? DEFAULT_MAX_ROUNDS_PER_DAY
  const eligiblePointsThreshold = config.dailyEligiblePointsThreshold ?? DEFAULT_ELIGIBLE_POINTS_THRESHOLD
  const rejoinPointsFloor = config.dailyRejoinPointsFloor ?? DEFAULT_REJOIN_POINTS_FLOOR

  function ensureSeason(runDate) {
    const window = buildSeasonWindow(runDate)
    return dailyRunStore.ensureSeason({
      ...window,
      rulesetVersion: RULESET_VERSION,
      eligiblePointsThreshold,
      rejoinPointsFloor,
    })
  }

  function collectUserBots() {
    return botStore
      .listBots({})
      .filter((bot) => bot.ownerUsername !== 'builtin')
      .map((bot) => {
        const source = botStore.getBotSource(bot.ownerUsername, bot.name)
        return source
          ? {
              ...bot,
              sourceText: source.sourceText,
            }
          : null
      })
      .filter(Boolean)
  }

  function listEligibleBots(seasonId, bots) {
    const standingsByBotId = new Map(dailyRunStore.listStandings(seasonId).map((entry) => [entry.botId, entry]))

    return bots.filter((bot) => {
      const standing = standingsByBotId.get(bot.botId)
      if (!standing) return false
      return standing.activeForNextRun && standing.seasonPoints >= eligiblePointsThreshold
    })
  }

  return {
    listRuns() {
      return {
        runs: dailyRunStore.listRuns(),
      }
    },

    getRun(runId) {
      const run = dailyRunStore.getRun(runId)
      if (!run) {
        throw createHttpError(404, 'RUN_NOT_FOUND', 'Daily run not found', {
          runId,
        })
      }
      return run
    },

    listRunMatches(runId) {
      const run = this.getRun(runId)
      return {
        runId: run.runId,
        matches: run.matchIds
          .map((matchId) => matchStore.getMatch(matchId))
          .filter(Boolean)
          .map((match) => ({
            matchId: match.matchId,
            kind: match.kind,
            status: match.status,
            dailyRunId: match.dailyRunId ?? null,
            matchSeed: match.matchSeed,
            tickCap: match.tickCap,
            result: match.result,
            participants: match.participants,
            createdAt: match.createdAt,
            updatedAt: match.updatedAt,
            ...(match.error ? { error: match.error } : {}),
          })),
      }
    },

    getStandings({ seasonId, runDate } = {}) {
      const resolvedRunDate = normalizeRunDate(runDate)
      const season =
        typeof seasonId === 'string' && seasonId.trim() !== ''
          ? dailyRunStore.getSeason(seasonId)
          : ensureSeason(resolvedRunDate)

      if (!season) {
        throw createHttpError(404, 'SEASON_NOT_FOUND', 'Season not found', {
          seasonId,
        })
      }

      const bots = collectUserBots()
      dailyRunStore.upsertSeasonBots(season.seasonId, bots, {
        initialPoints: season.rejoinPointsFloor,
      })

      return buildSeasonResponse(season, dailyRunStore.listStandings(season.seasonId))
    },

    reenableBot(owner, name, { currentUser, seasonId, runDate } = {}) {
      requireAuthenticatedOwner(owner, currentUser)

      const bot = botStore.getBot(owner, name)
      if (!bot) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner,
          name,
        })
      }

      const season =
        typeof seasonId === 'string' && seasonId.trim() !== ''
          ? dailyRunStore.getSeason(seasonId)
          : ensureSeason(normalizeRunDate(runDate))

      if (!season) {
        throw createHttpError(404, 'SEASON_NOT_FOUND', 'Season not found', {
          seasonId,
        })
      }

      const entry = dailyRunStore.reenableBot(season.seasonId, {
        botId: bot.botId,
        ownerUsername: bot.ownerUsername,
        name: bot.name,
        sourceHash: bot.sourceHash,
      })

      return {
        seasonId: season.seasonId,
        bot: entry,
      }
    },

    createDailyRun(body = {}) {
      if (!isPlainObject(body)) {
        throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
      }

      const runDate = normalizeRunDate(body.runDate)
      const tickCap = parseOptionalPositiveInt(body.tickCap, config.maxTickCap, 'tickCap')
      const requestedMaxRounds = parseOptionalPositiveInt(body.maxRoundsPerDay, maxRoundsPerDay, 'maxRoundsPerDay')
      const runSeed = body.seed ?? `${runDate}:daily`
      const season = ensureSeason(runDate)

      const bots = collectUserBots()
      dailyRunStore.upsertSeasonBots(season.seasonId, bots, {
        initialPoints: season.rejoinPointsFloor,
      })

      let eligibleBots = listEligibleBots(season.seasonId, bots)

      const run = dailyRunStore.createRun({
        seasonId: season.seasonId,
        runDate,
        runSeed,
        tickCap,
        maxRoundsPerDay: requestedMaxRounds,
        rulesetVersion: RULESET_VERSION,
        eligibleBotCount: eligibleBots.length,
      })

      if (eligibleBots.length < SLOT_IDS.length) {
        return dailyRunStore.markRunComplete(run.runId, {
          rounds: [],
          leaderboardSnapshot: dailyRunStore.listStandings(season.seasonId),
          stopReason: 'TOO_FEW_ELIGIBLE_BOTS',
        })
      }

      dailyRunStore.markRunRunning(run.runId)

      const rounds = []

      try {
        for (let roundIndex = 0; roundIndex < requestedMaxRounds; roundIndex += 1) {
          eligibleBots = listEligibleBots(season.seasonId, bots)
          if (eligibleBots.length < SLOT_IDS.length) {
            break
          }

          const orderedBots = deterministicOrder(eligibleBots, [String(runSeed), String(roundIndex)])
          const groups = chunkIntoMatches(orderedBots)

          if (groups.length === 0) {
            break
          }

          const roundSummary = {
            roundIndex,
            scheduledBotIds: orderedBots.map((bot) => bot.botId),
            matchIds: [],
          }

          for (let matchIndex = 0; matchIndex < groups.length; matchIndex += 1) {
            const group = groups[matchIndex]
            const participants = group.map((bot, index) => ({
              slot: SLOT_IDS[index],
              botId: bot.botId,
              ownerUsername: bot.ownerUsername,
              name: bot.name,
              displayName: bot.name,
              sourceTextSnapshot: bot.sourceText,
              sourceHash: bot.sourceHash,
              loadoutSnapshot: emptyLoadout(),
              loadoutIssues: [],
            }))

            const matchSeed = deriveMatchSeed(runSeed, roundIndex, matchIndex)
            const match = matchStore.createMatch({
              kind: 'daily',
              dailyRunId: run.runId,
              matchSeed,
              tickCap,
              participants,
            })

            dailyRunStore.appendRunMatch(run.runId, match.matchId)

            const completed = runStoredMatch({
              store: matchStore,
              matchId: match.matchId,
              matchSeed,
              tickCap,
              participants,
              runMatch,
              buildResult: createDailyResultBuilder(),
            })

            dailyRunStore.applyPoints(season.seasonId, {
              runDate,
              pointsByBotId: completed.result.pointsByBotId,
              botSnapshots: group,
            })

            roundSummary.matchIds.push(match.matchId)
          }

          roundSummary.remainingEligibleBotIds = listEligibleBots(season.seasonId, bots).map((bot) => bot.botId)
          rounds.push(roundSummary)
        }

        const stopReason =
          listEligibleBots(season.seasonId, bots).length < SLOT_IDS.length ? 'TOO_FEW_ELIGIBLE_BOTS' : 'MAX_ROUNDS_REACHED'

        return dailyRunStore.markRunComplete(run.runId, {
          rounds,
          leaderboardSnapshot: dailyRunStore.listStandings(season.seasonId),
          stopReason,
        })
      } catch (error) {
        dailyRunStore.markRunFailed(run.runId, {
          code: error?.code ?? 'DAILY_RUN_FAILED',
          message: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}
