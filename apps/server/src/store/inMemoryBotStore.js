import { loadBuiltinExampleBots } from '../services/exampleBots.js'

function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

function botKey(ownerUsername, name) {
  return `${ownerUsername}/${name}`
}

export function createInMemoryBotStore() {
  const bots = new Map()

  for (const builtin of loadBuiltinExampleBots()) {
    bots.set(botKey(builtin.ownerUsername, builtin.name), {
      ...builtin,
      createdAt: null,
      updatedAt: null,
      sourceHash: null,
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
      let count = 0
      for (const bot of bots.values()) {
        if (bot.ownerUsername === ownerUsername) {
          count += 1
        }
      }
      return count
    },

    getBot(ownerUsername, name) {
      const bot = requireBot(ownerUsername, name)
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
      const bot = requireBot(ownerUsername, name)
      if (!bot) return null
      return cloneRecord({
        botId: bot.botId,
        sourceText: bot.sourceText,
      })
    },

    saveBot({ ownerUsername, name, sourceText, sourceHash, saveMessage }) {
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

      bots.set(key, next)
      return cloneRecord({
        botId: next.botId,
        ownerUsername: next.ownerUsername,
        name: next.name,
        updatedAt: next.updatedAt,
        sourceHash: next.sourceHash,
      })
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
