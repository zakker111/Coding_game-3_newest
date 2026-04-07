import { createSourceSnapshot } from './sourceText.js'

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function validatePathPart(value, field) {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value)) {
    throw createHttpError(400, 'INVALID_REQUEST', `${field} must match ${NAME_PATTERN}`, {
      field,
    })
  }
  return value
}

function normalizeSaveMessage(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, 160)
}

export function createBotService({ store, config }) {
  if (!store) {
    throw new Error('createBotService requires a store')
  }

  return {
    listBots(query = {}) {
      const ownerUsername =
        typeof query.owner === 'string' && query.owner.trim() !== '' ? validatePathPart(query.owner.trim(), 'owner') : undefined
      const textQuery = typeof query.q === 'string' ? query.q : undefined

      return {
        bots: store.listBots({
          ownerUsername,
          query: textQuery,
        }),
      }
    },

    getBot(owner, name) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const bot = store.getBot(ownerUsername, botName)
      if (!bot) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return bot
    },

    getBotSource(owner, name) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const source = store.getBotSource(ownerUsername, botName)
      if (!source) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return source
    },

    saveBot(owner, name, body) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')

      if (ownerUsername === 'builtin') {
        throw createHttpError(403, 'FORBIDDEN', 'builtin bots are server-managed', {
          owner: ownerUsername,
          name: botName,
        })
      }

      if (typeof body !== 'object' || body == null || Array.isArray(body)) {
        throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
      }

      if (typeof body.sourceText !== 'string') {
        throw createHttpError(400, 'INVALID_REQUEST', 'sourceText must be a string', {
          field: 'sourceText',
        })
      }

      const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(body.sourceText, config)
      const saveMessage = normalizeSaveMessage(body.saveMessage)

      return store.saveBot({
        ownerUsername,
        name: botName,
        sourceText: sourceTextSnapshot,
        sourceHash,
        saveMessage,
      })
    },

    listVersions(owner, name) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const versions = store.listVersions(ownerUsername, botName)
      if (!versions) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return versions
    },

    getVersionSource(owner, name, sourceHash) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')

      if (typeof sourceHash !== 'string' || sourceHash.trim() === '') {
        throw createHttpError(400, 'INVALID_REQUEST', 'sourceHash must be a non-empty string', {
          field: 'sourceHash',
        })
      }

      const version = store.getVersionSource(ownerUsername, botName, sourceHash)
      if (!version) {
        throw createHttpError(404, 'BOT_VERSION_NOT_FOUND', 'Bot version not found', {
          owner: ownerUsername,
          name: botName,
          sourceHash,
        })
      }
      return version
    },
  }
}
