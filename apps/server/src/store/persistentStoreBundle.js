import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

import { loadBuiltinExampleBots } from '../services/exampleBots.js'

function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

function botKey(ownerUsername, name) {
  return `${ownerUsername}/${name}`
}

function createInitialState() {
  return {
    version: 1,
    nextUserId: 1,
    nextMatchId: 1,
    nextRunId: 1,
    users: [],
    sessions: [],
    bots: [],
    matches: [],
    seasons: [],
    dailyRuns: [],
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialState()

  return {
    version: raw.version === 1 ? 1 : 1,
    nextUserId: Number.isInteger(raw.nextUserId) && raw.nextUserId > 0 ? raw.nextUserId : 1,
    nextMatchId: Number.isInteger(raw.nextMatchId) && raw.nextMatchId > 0 ? raw.nextMatchId : 1,
    nextRunId: Number.isInteger(raw.nextRunId) && raw.nextRunId > 0 ? raw.nextRunId : 1,
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    bots: Array.isArray(raw.bots) ? raw.bots : [],
    matches: Array.isArray(raw.matches) ? raw.matches : [],
    seasons: Array.isArray(raw.seasons) ? raw.seasons : [],
    dailyRuns: Array.isArray(raw.dailyRuns) ? raw.dailyRuns : [],
  }
}

function readState(filePath) {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    return normalizeState(raw)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createInitialState()
    }
    throw error
  }
}

function writeState(filePath, state) {
  mkdirSync(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, JSON.stringify(state, null, 2))
  renameSync(tempPath, filePath)
}

export function createPersistentStoreBundle({ filePath }) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('createPersistentStoreBundle requires a non-empty filePath')
  }

  const state = readState(filePath)
  const builtinBots = new Map()

  for (const builtin of loadBuiltinExampleBots()) {
    builtinBots.set(botKey(builtin.ownerUsername, builtin.name), {
      ...builtin,
      createdAt: null,
      updatedAt: null,
      sourceHash: null,
      versions: [],
    })
  }

  function persist() {
    writeState(filePath, state)
  }

  function findUserBot(ownerUsername, name) {
    return state.bots.find((bot) => bot.ownerUsername === ownerUsername && bot.name === name) ?? null
  }

  function findAnyBot(ownerUsername, name) {
    if (ownerUsername === 'builtin') {
      return builtinBots.get(botKey(ownerUsername, name)) ?? null
    }
    return findUserBot(ownerUsername, name)
  }

  const userStore = {
    createUser({ username, passwordHash }) {
      const createdAt = new Date().toISOString()
      const user = {
        id: `u_${String(state.nextUserId).padStart(6, '0')}`,
        username,
        passwordHash,
        createdAt,
      }
      state.nextUserId += 1
      state.users.push(user)
      persist()
      return cloneRecord(user)
    },

    getUserByUsername(username) {
      return cloneRecord(state.users.find((user) => user.username === username) ?? null)
    },

    getUserById(userId) {
      return cloneRecord(state.users.find((user) => user.id === userId) ?? null)
    },

    createSession({ userId }) {
      const session = {
        sessionId: randomBytes(24).toString('hex'),
        userId,
        createdAt: new Date().toISOString(),
      }
      state.sessions.push(session)
      persist()
      return cloneRecord(session)
    },

    getSession(sessionId) {
      return cloneRecord(state.sessions.find((session) => session.sessionId === sessionId) ?? null)
    },

    deleteSession(sessionId) {
      const nextSessions = state.sessions.filter((session) => session.sessionId !== sessionId)
      if (nextSessions.length === state.sessions.length) return
      state.sessions = nextSessions
      persist()
    },
  }

  const botStore = {
    listBots({ ownerUsernames, query } = {}) {
      const allowedOwners = Array.isArray(ownerUsernames) ? new Set(ownerUsernames) : null
      const normalizedQuery = typeof query === 'string' && query.trim() !== '' ? query.trim().toLowerCase() : null
      const results = []

      for (const bot of [...builtinBots.values(), ...state.bots]) {
        if (allowedOwners && !allowedOwners.has(bot.ownerUsername)) continue
        if (
          normalizedQuery &&
          !bot.botId.toLowerCase().includes(normalizedQuery) &&
          !bot.name.toLowerCase().includes(normalizedQuery)
        ) {
          continue
        }
        results.push({
          botId: bot.botId,
          ownerUsername: bot.ownerUsername,
          name: bot.name,
          updatedAt: bot.updatedAt,
          sourceHash: bot.sourceHash,
        })
      }

      results.sort((a, b) => {
        if (a.ownerUsername !== b.ownerUsername) return a.ownerUsername.localeCompare(b.ownerUsername)
        return a.name.localeCompare(b.name)
      })

      return cloneRecord(results)
    },

    countOwnedBots(ownerUsername) {
      return state.bots.filter((bot) => bot.ownerUsername === ownerUsername).length
    },

    getBot(ownerUsername, name) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord({
        botId: bot.botId,
        ownerUsername: bot.ownerUsername,
        name: bot.name,
        updatedAt: bot.updatedAt,
        sourceHash: bot.sourceHash,
      })
    },

    getBotSource(ownerUsername, name) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord({
        botId: bot.botId,
        sourceText: bot.sourceText,
      })
    },

    saveBot({ ownerUsername, name, sourceText, sourceHash, saveMessage }) {
      const existing = findUserBot(ownerUsername, name)
      const timestamp = new Date().toISOString()
      const versions = existing?.versions ? [...existing.versions] : []

      if (!versions.some((version) => version.sourceHash === sourceHash)) {
        versions.push({
          sourceHash,
          sourceText,
          createdAt: timestamp,
          ...(saveMessage ? { saveMessage } : {}),
        })
      }

      const next = {
        ownerUsername,
        name,
        botId: `${ownerUsername}/${name}`,
        sourceText,
        sourceHash,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        versions,
      }

      if (existing) {
        const index = state.bots.findIndex((bot) => bot.ownerUsername === ownerUsername && bot.name === name)
        state.bots[index] = next
      } else {
        state.bots.push(next)
      }

      persist()
      return cloneRecord({
        botId: next.botId,
        ownerUsername: next.ownerUsername,
        name: next.name,
        updatedAt: next.updatedAt,
        sourceHash: next.sourceHash,
      })
    },

    listVersions(ownerUsername, name) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null

      return cloneRecord({
        botId: bot.botId,
        versions: (bot.versions ?? []).map((version) => ({
          sourceHash: version.sourceHash,
          createdAt: version.createdAt,
          ...(version.saveMessage ? { saveMessage: version.saveMessage } : {}),
        })),
      })
    },

    getVersionSource(ownerUsername, name, sourceHash) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null
      const version = (bot.versions ?? []).find((entry) => entry.sourceHash === sourceHash)
      if (!version) return null
      return cloneRecord({
        botId: bot.botId,
        sourceHash: version.sourceHash,
        sourceText: version.sourceText,
      })
    },
  }

  const matchStore = {
    createMatch(meta) {
      const matchId = `m_${String(state.nextMatchId).padStart(6, '0')}`
      state.nextMatchId += 1

      const createdAt = new Date().toISOString()
      const match = {
        matchId,
        kind: 'sandbox',
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        result: null,
        replay: null,
        error: null,
        ...meta,
      }

      state.matches.push(match)
      persist()
      return cloneRecord(match)
    },

    markRunning(matchId) {
      const match = state.matches.find((entry) => entry.matchId === matchId)
      if (!match) {
        throw new Error(`Unknown match: ${matchId}`)
      }
      match.status = 'running'
      match.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(match)
    },

    markComplete(matchId, payload) {
      const match = state.matches.find((entry) => entry.matchId === matchId)
      if (!match) {
        throw new Error(`Unknown match: ${matchId}`)
      }
      match.status = 'complete'
      match.result = payload.result
      match.replay = payload.replay
      match.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(match)
    },

    markFailed(matchId, error) {
      const match = state.matches.find((entry) => entry.matchId === matchId)
      if (!match) {
        throw new Error(`Unknown match: ${matchId}`)
      }
      match.status = 'failed'
      match.error = error
      match.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(match)
    },

    getMatch(matchId) {
      return cloneRecord(state.matches.find((entry) => entry.matchId === matchId) ?? null)
    },

    getReplay(matchId) {
      const match = state.matches.find((entry) => entry.matchId === matchId)
      return cloneRecord(match?.replay ?? null)
    },
  }

  const dailyRunStore = {
    ensureSeason(meta) {
      const existing = state.seasons.find((season) => season.seasonId === meta.seasonId)
      if (existing) return cloneRecord(existing)

      const createdAt = new Date().toISOString()
      const season = {
        createdAt,
        updatedAt: createdAt,
        standings: [],
        ...meta,
      }
      state.seasons.push(season)
      persist()
      return cloneRecord(season)
    },

    getSeason(seasonId) {
      return cloneRecord(state.seasons.find((season) => season.seasonId === seasonId) ?? null)
    },

    listStandings(seasonId) {
      const season = state.seasons.find((entry) => entry.seasonId === seasonId)
      if (!season) return []

      const standings = [...season.standings].sort((a, b) => {
        if (a.seasonPoints !== b.seasonPoints) return b.seasonPoints - a.seasonPoints
        if (a.activeForNextRun !== b.activeForNextRun) return Number(b.activeForNextRun) - Number(a.activeForNextRun)
        return a.botId.localeCompare(b.botId)
      })

      return cloneRecord(standings)
    },

    upsertSeasonBots(seasonId, bots, { initialPoints = 0 } = {}) {
      const season = state.seasons.find((entry) => entry.seasonId === seasonId)
      if (!season) {
        throw new Error(`Unknown season: ${seasonId}`)
      }

      let touched = false

      for (const bot of bots) {
        let entry = season.standings.find((standing) => standing.botId === bot.botId)
        if (!entry) {
          const timestamp = new Date().toISOString()
          season.standings.push({
            botId: bot.botId,
            ownerUsername: bot.ownerUsername,
            name: bot.name,
            seasonPoints: initialPoints,
            activeForNextRun: true,
            lastActiveRunDate: null,
            lastSourceHash: bot.sourceHash ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
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
        persist()
      }

      return this.listStandings(seasonId)
    },

    applyPoints(seasonId, { runDate, pointsByBotId, botSnapshots }) {
      const season = state.seasons.find((entry) => entry.seasonId === seasonId)
      if (!season) {
        throw new Error(`Unknown season: ${seasonId}`)
      }

      const timestamp = new Date().toISOString()

      for (const bot of botSnapshots) {
        let entry = season.standings.find((standing) => standing.botId === bot.botId)
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
      persist()
      return this.listStandings(seasonId)
    },

    reenableBot(seasonId, bot) {
      const season = state.seasons.find((entry) => entry.seasonId === seasonId)
      if (!season) {
        throw new Error(`Unknown season: ${seasonId}`)
      }

      const timestamp = new Date().toISOString()
      let entry = season.standings.find((standing) => standing.botId === bot.botId)

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
      persist()
      return cloneRecord(entry)
    },

    createRun(meta) {
      const runId = `dr_${String(state.nextRunId).padStart(6, '0')}`
      state.nextRunId += 1

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

      state.dailyRuns.push(run)
      persist()
      return cloneRecord(run)
    },

    listRuns() {
      const runs = [...state.dailyRuns].sort((a, b) => b.runId.localeCompare(a.runId))
      return cloneRecord(runs)
    },

    getRun(runId) {
      return cloneRecord(state.dailyRuns.find((run) => run.runId === runId) ?? null)
    },

    markRunRunning(runId) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.status = 'running'
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },

    appendRunMatch(runId, matchId) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.matchIds.push(matchId)
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },

    markRunComplete(runId, payload) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.status = 'complete'
      run.rounds = payload.rounds
      run.leaderboardSnapshot = payload.leaderboardSnapshot
      run.stopReason = payload.stopReason
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },

    markRunFailed(runId, error) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.status = 'failed'
      run.error = error
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },
  }

  return {
    userStore,
    botStore,
    matchStore,
    dailyRunStore,
  }
}
