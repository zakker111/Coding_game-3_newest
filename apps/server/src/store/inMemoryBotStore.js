import { loadBuiltinExampleBots } from '../services/exampleBots.js'
import { EMPTY_LOADOUT, normalizeLoadout } from '@coding-game/ruleset'

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

export function createInMemoryBotStore() {
  const bots = new Map()

  for (const builtin of loadBuiltinExampleBots()) {
    bots.set(botKey(builtin.ownerUsername, builtin.name), {
      ...builtin,
      createdAt: null,
      updatedAt: null,
      sourceHash: null,
      loadout: normalizeLoadout(builtin.loadout ?? EMPTY_LOADOUT).loadout,
      versions: [],
    })
  }

  function requireBot(ownerUsername, name) {
    return bots.get(botKey(ownerUsername, name)) ?? null
  }

  return {
    listBots({ ownerUsernames, query } = {}) {
      const allowedOwners = Array.isArray(ownerUsernames) ? new Set(ownerUsernames) : null
      const normalizedQuery = typeof query === 'string' && query.trim() !== '' ? query.trim().toLowerCase() : null

      const results = []
      for (const bot of bots.values()) {
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
      let count = 0
      for (const bot of bots.values()) {
        if (bot.ownerUsername === ownerUsername) {
          count += 1
        }
      }
      return count
    },

    updateRankedStatus(ownerUsername, name, rankedPatch) {
      const key = botKey(ownerUsername, name)
      const bot = bots.get(key)
      if (!bot) return null
      const next = {
        ...bot,
        ...rankedFields({ ...bot, ...rankedPatch }),
      }
      bots.set(key, next)
      return cloneRecord(botSummary(next))
    },

    getBot(ownerUsername, name) {
      const bot = requireBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord(botSummary(bot))
    },

    getBotSource(ownerUsername, name) {
      const bot = requireBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord({
        botId: bot.botId,
        sourceText: bot.sourceText,
        loadout: normalizeLoadout(bot.loadout ?? EMPTY_LOADOUT).loadout,
      })
    },

    saveBot({ ownerUsername, name, sourceText, sourceHash, loadout, saveMessage }) {
      const key = botKey(ownerUsername, name)
      const existing = bots.get(key)
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

      bots.set(key, next)
      return cloneRecord(botSummary(next))
    },

    listVersions(ownerUsername, name) {
      const bot = requireBot(ownerUsername, name)
      if (!bot) return null

      return cloneRecord({
        botId: bot.botId,
        versions: bot.versions.map((version) => ({
          sourceHash: version.sourceHash,
          createdAt: version.createdAt,
          ...(version.saveMessage ? { saveMessage: version.saveMessage } : {}),
        })),
      })
    },

    getVersionSource(ownerUsername, name, sourceHash) {
      const bot = requireBot(ownerUsername, name)
      if (!bot) return null
      const version = bot.versions.find((entry) => entry.sourceHash === sourceHash)
      if (!version) return null
      return cloneRecord({
        botId: bot.botId,
        sourceHash: version.sourceHash,
        sourceText: version.sourceText,
      })
    },
  }
}
