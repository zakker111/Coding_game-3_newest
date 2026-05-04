import { RULESET_VERSION } from '@coding-game/ruleset'

const DEFAULT_TICK_CAP = 600
const DEFAULT_MAX_ROUNDS = 1
const DEFAULT_PLACEMENT_POINTS = [3, 2, 1, 0]
const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

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

function validateDate(value) {
  if (value == null || value === '') return new Date().toISOString().slice(0, 10)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createHttpError(400, 'INVALID_REQUEST', 'runDate must use YYYY-MM-DD format', {
      field: 'runDate',
    })
  }
  return value
}

function validateSeed(value, runDate) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return `daily:${runDate}`
}

function validatePositiveInt(value, fallback, field) {
  if (value == null) return fallback
  if (!Number.isInteger(value) || value <= 0) {
    throw createHttpError(400, 'INVALID_REQUEST', `${field} must be a positive integer`, {
      field,
    })
  }
  return value
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffleIdentity(item) {
  if (Array.isArray(item)) return item.map((entry) => entry.botId).join('|')
  return item.botId
}

function deterministicShuffle(items, seed) {
  return items
    .map((item, index) => ({
      item,
      key: hashString(`${String(seed)}:${index}:${shuffleIdentity(item)}`),
    }))
    .sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key
      return shuffleIdentity(a.item).localeCompare(shuffleIdentity(b.item))
    })
    .map((entry) => entry.item)
}

function createFourBotCombinations(bots) {
  const combinations = []
  for (let first = 0; first < bots.length - 3; first += 1) {
    for (let second = first + 1; second < bots.length - 2; second += 1) {
      for (let third = second + 1; third < bots.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < bots.length; fourth += 1) {
          combinations.push([bots[first], bots[second], bots[third], bots[fourth]])
        }
      }
    }
  }
  return combinations
}

function parseBotId(botId) {
  const slashIndex = botId.indexOf('/')
  if (slashIndex === -1) return null
  return {
    ownerUsername: botId.slice(0, slashIndex),
    name: botId.slice(slashIndex + 1),
  }
}

function buildParticipants(botStore, bots) {
  return bots.map((bot, index) => {
    const identity = parseBotId(bot.botId)
    const source = identity ? botStore.getBotSource(identity.ownerUsername, identity.name) : null
    if (!source) {
      throw createHttpError(404, 'BOT_NOT_FOUND', 'Daily run bot source not found', {
        botId: bot.botId,
      })
    }

    return {
      slot: SLOT_IDS[index],
      displayName: bot.botId,
      sourceText: source.sourceText,
      loadout: [null, null, null],
    }
  })
}

function scoreMatch(match) {
  const pointsByBotId = {}
  const participantBySlot = new Map(match.participants.map((participant) => [participant.slot, participant]))
  const aliveSlots = new Set((match.result?.survivors ?? []).map((survivor) => survivor.slot))

  if (match.result?.winnerSlot) {
    for (const participant of match.participants) {
      pointsByBotId[participant.displayName] =
        participant.slot === match.result.winnerSlot ? DEFAULT_PLACEMENT_POINTS[0] : DEFAULT_PLACEMENT_POINTS[3]
    }
    return pointsByBotId
  }

  if (aliveSlots.size > 0) {
    const tiedPoints =
      DEFAULT_PLACEMENT_POINTS.slice(0, aliveSlots.size).reduce((sum, points) => sum + points, 0) / aliveSlots.size
    for (const participant of match.participants) {
      pointsByBotId[participant.displayName] = aliveSlots.has(participant.slot) ? tiedPoints : DEFAULT_PLACEMENT_POINTS[3]
    }
    return pointsByBotId
  }

  for (const slot of SLOT_IDS) {
    const participant = participantBySlot.get(slot)
    if (participant) {
      pointsByBotId[participant.displayName] = DEFAULT_PLACEMENT_POINTS[3]
    }
  }
  return pointsByBotId
}

function summarizeRun(matches) {
  const pointsByBotId = {}
  const matchesByBotId = {}

  for (const match of matches) {
    for (const participant of match.participants) {
      matchesByBotId[participant.displayName] = (matchesByBotId[participant.displayName] ?? 0) + 1
    }

    const matchPoints = scoreMatch(match)
    for (const [botId, points] of Object.entries(matchPoints)) {
      pointsByBotId[botId] = (pointsByBotId[botId] ?? 0) + points
    }
  }

  const leaderboard = Object.entries(matchesByBotId)
    .map(([botId, matchesPlayed]) => ({
      botId,
      matchesPlayed,
      points: pointsByBotId[botId] ?? 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return a.botId.localeCompare(b.botId)
    })

  return {
    matchCount: matches.length,
    leaderboard,
  }
}

export function createDailyRunService({ store, botStore, matchStore, simulationService, config }) {
  if (!store || !botStore || !matchStore || !simulationService) {
    throw new Error('createDailyRunService requires store, botStore, matchStore, and simulationService')
  }

  return {
    listRuns() {
      return {
        runs: store.listRuns(),
      }
    },

    getRun(runId) {
      const run = store.getRun(runId)
      if (!run) {
        throw createHttpError(404, 'DAILY_RUN_NOT_FOUND', 'Daily run not found')
      }
      return run
    },

    getRunMatches(runId) {
      const run = this.getRun(runId)
      return {
        runId,
        matches: run.matchIds.map((matchId) => matchStore.getMatch(matchId)).filter(Boolean),
      }
    },

    createRun(input = {}) {
      if (!isPlainObject(input)) {
        throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
      }

      const runDate = validateDate(input.runDate)
      const runSeed = validateSeed(input.seed, runDate)
      const tickCap = validatePositiveInt(input.tickCap, DEFAULT_TICK_CAP, 'tickCap')
      if (tickCap > config.maxTickCap) {
        throw createHttpError(400, 'INVALID_REQUEST', `tickCap must be <= ${config.maxTickCap}`, {
          field: 'tickCap',
          maxTickCap: config.maxTickCap,
          actual: tickCap,
        })
      }
      const maxRounds = validatePositiveInt(input.maxRounds, DEFAULT_MAX_ROUNDS, 'maxRounds')
      const eligibleBots = deterministicShuffle(botStore.listBots(), runSeed)

      if (eligibleBots.length < SLOT_IDS.length) {
        throw createHttpError(409, 'NOT_ENOUGH_BOTS', 'Daily runs require at least four eligible bots', {
          eligibleBotCount: eligibleBots.length,
          requiredBotCount: SLOT_IDS.length,
        })
      }

      const run = store.createRun({
        runDate,
        runSeed,
        rulesetVersion: RULESET_VERSION,
        maxRounds,
        tickCap,
      })

      store.markRunning(run.runId)

      try {
        const matches = []
        const matchIds = []

        for (let round = 0; round < maxRounds; round += 1) {
          const roundBots = deterministicShuffle(eligibleBots, `${String(runSeed)}:round:${round}`)
          const groups = deterministicShuffle(createFourBotCombinations(roundBots), `${String(runSeed)}:round:${round}:groups`)

          for (let index = 0; index < groups.length; index += 1) {
            const group = groups[index]
            const match = simulationService.createSimulation(
              {
                seed: `${String(runSeed)}:round:${round}:match:${index}`,
                tickCap,
                participants: buildParticipants(botStore, group),
              },
              {
                kind: 'daily',
                dailyRunId: run.runId,
              }
            )

            matches.push(match)
            matchIds.push(match.matchId)
          }
        }

        return store.markComplete(run.runId, {
          matchIds,
          summary: summarizeRun(matches),
        })
      } catch (error) {
        store.markFailed(run.runId, {
          code: error?.code ?? 'DAILY_RUN_FAILED',
          message: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}
