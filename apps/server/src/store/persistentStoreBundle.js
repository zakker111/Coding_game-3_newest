import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { EMPTY_LOADOUT, normalizeLoadout } from '@coding-game/ruleset'

import { loadBuiltinExampleBots } from '../services/exampleBots.js'

function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

function botKey(ownerUsername, name) {
  return `${ownerUsername}/${name}`
}

function rankedFields(bot) {
  const source = bot && typeof bot === 'object' ? bot : {}
  return {
    rankedEnabled: source.rankedEnabled !== false,
    rankedStatus: source.rankedStatus === 'pending' || source.rankedStatus === 'dropped' ? source.rankedStatus : 'active',
    rankedPoints: Number.isFinite(source.rankedPoints) ? source.rankedPoints : 0,
    lastRankedRunId: typeof source.lastRankedRunId === 'string' ? source.lastRankedRunId : null,
    lastSubmittedAt: typeof source.lastSubmittedAt === 'string' ? source.lastSubmittedAt : null,
    droppedAt: typeof source.droppedAt === 'string' ? source.droppedAt : null,
    dropReason: typeof source.dropReason === 'string' ? source.dropReason : null,
  }
}

function botSummary(bot) {
  return {
    botId: bot.botId,
    ownerUsername: bot.ownerUsername,
    name: bot.name,
    updatedAt: bot.updatedAt,
    sourceHash: bot.sourceHash,
    loadout: normalizeLoadout(bot.loadout ?? EMPTY_LOADOUT).loadout,
    ...rankedFields(bot),
  }
}

function createInitialState() {
  return {
    version: 1,
    nextUserId: 1,
    nextMatchId: 1,
    users: [],
    sessions: [],
    bots: [],
    matches: [],
    dailyRuns: [],
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialState()

  return {
    version: raw.version === 1 ? 1 : 1,
    nextUserId: Number.isInteger(raw.nextUserId) && raw.nextUserId > 0 ? raw.nextUserId : 1,
    nextMatchId: Number.isInteger(raw.nextMatchId) && raw.nextMatchId > 0 ? raw.nextMatchId : 1,
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    bots: Array.isArray(raw.bots) ? raw.bots : [],
    matches: Array.isArray(raw.matches) ? raw.matches : [],
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
  let transactionDepth = 0
  let transactionDirty = false

  for (const builtin of loadBuiltinExampleBots()) {
    builtinBots.set(botKey(builtin.ownerUsername, builtin.name), {
      ...builtin,
      createdAt: null,
      updatedAt: null,
      sourceHash: null,
      loadout: normalizeLoadout(builtin.loadout ?? EMPTY_LOADOUT).loadout,
      versions: [],
    })
  }

  function persist() {
    if (transactionDepth > 0) {
      transactionDirty = true
      return
    }
    writeState(filePath, state)
  }

  function transact(fn) {
    transactionDepth += 1
    try {
      return fn()
    } finally {
      transactionDepth -= 1
      if (transactionDepth === 0 && transactionDirty) {
        transactionDirty = false
        writeState(filePath, state)
      }
    }
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
        results.push(botSummary(bot))
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

    updateRankedStatus(ownerUsername, name, rankedPatch) {
      const bot = findUserBot(ownerUsername, name)
      if (!bot) return null
      Object.assign(bot, rankedFields({ ...bot, ...rankedPatch }))
      persist()
      return cloneRecord(botSummary(bot))
    },

    getBot(ownerUsername, name) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord(botSummary(bot))
    },

    getBotSource(ownerUsername, name) {
      const bot = findAnyBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord({
        botId: bot.botId,
        sourceText: bot.sourceText,
        loadout: normalizeLoadout(bot.loadout ?? EMPTY_LOADOUT).loadout,
      })
    },

    saveBot({ ownerUsername, name, sourceText, sourceHash, loadout, saveMessage }) {
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

      const ranked = rankedFields(existing)
      const nextRankedStatus = ranked.rankedStatus === 'dropped' ? 'pending' : ranked.rankedStatus
      const next = {
        ownerUsername,
        name,
        botId: `${ownerUsername}/${name}`,
        sourceText,
        sourceHash,
        loadout: normalizeLoadout(loadout ?? existing?.loadout ?? EMPTY_LOADOUT).loadout,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        ...ranked,
        rankedStatus: nextRankedStatus,
        lastSubmittedAt: timestamp,
        versions,
      }

      if (existing) {
        const index = state.bots.findIndex((bot) => bot.ownerUsername === ownerUsername && bot.name === name)
        state.bots[index] = next
      } else {
        state.bots.push(next)
      }

      persist()
      return cloneRecord(botSummary(next))
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

    listMatches({ dailyRunId, kind } = {}) {
      const matches = state.matches.filter((match) => {
        if (dailyRunId && match.dailyRunId !== dailyRunId) return false
        if (kind && match.kind !== kind) return false
        return true
      })
      return cloneRecord(matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },
  }

  const dailyRunStore = {
    createRun(meta) {
      const existingIds = state.dailyRuns
        .map((run) => (typeof run.runId === 'string' ? Number.parseInt(run.runId.slice(2), 10) : 0))
        .filter((id) => Number.isInteger(id))
      const runId = `d_${String(Math.max(0, ...existingIds) + 1).padStart(6, '0')}`
      const createdAt = new Date().toISOString()
      const run = {
        runId,
        status: 'planned',
        createdAt,
        updatedAt: createdAt,
        matchIds: [],
        summary: null,
        error: null,
        ...meta,
      }

      state.dailyRuns.push(run)
      persist()
      return cloneRecord(run)
    },

    markRunning(runId) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.status = 'running'
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },

    markComplete(runId, payload) {
      const run = state.dailyRuns.find((entry) => entry.runId === runId)
      if (!run) {
        throw new Error(`Unknown daily run: ${runId}`)
      }
      run.status = 'complete'
      run.matchIds = payload.matchIds
      run.summary = payload.summary
      run.updatedAt = new Date().toISOString()
      persist()
      return cloneRecord(run)
    },

    markFailed(runId, error) {
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

    getRun(runId) {
      return cloneRecord(state.dailyRuns.find((entry) => entry.runId === runId) ?? null)
    },

    listRuns() {
      return cloneRecord([...state.dailyRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },

    transact,
  }

  return {
    userStore,
    botStore,
    matchStore,
    dailyRunStore,
  }
}
