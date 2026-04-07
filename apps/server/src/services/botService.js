import { createSourceSnapshot } from './sourceText.js'

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const STARTER_BOT_NAMES = ['bot1', 'bot2', 'bot3']

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

function sortBots(bots) {
  return [...bots].sort((a, b) => {
    if (a.ownerUsername !== b.ownerUsername) return a.ownerUsername.localeCompare(b.ownerUsername)
    return a.name.localeCompare(b.name)
  })
}

function requireAuthenticatedUser(currentUser, action) {
  if (!currentUser) {
    throw createHttpError(401, 'AUTH_REQUIRED', `authentication is required to ${action}`)
  }
}

function authorizeOwnerRead(ownerUsername, currentUser) {
  if (ownerUsername === 'builtin') return
  requireAuthenticatedUser(currentUser, 'view user bots')
  if (currentUser.username !== ownerUsername) {
    throw createHttpError(403, 'FORBIDDEN', 'you can only access bots for the authenticated user', {
      owner: ownerUsername,
      authenticatedUsername: currentUser.username,
    })
  }
}

export function createBotService({ store, config }) {
  if (!store) {
    throw new Error('createBotService requires a store')
  }

  return {
    ensureStarterBots(owner) {
      const ownerUsername = validatePathPart(owner, 'owner')

      if (ownerUsername === 'builtin') return

      const starterSource = store.getBotSource('builtin', 'bot0')?.sourceText ?? 'WAIT 1\n'

      for (const name of STARTER_BOT_NAMES) {
        if (store.getBot(ownerUsername, name)) continue
        const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(starterSource, config)
        store.saveBot({
          ownerUsername,
          name,
          sourceText: sourceTextSnapshot,
          sourceHash,
          saveMessage: 'starter bot',
        })
      }
    },

    listBots(query = {}, { currentUser } = {}) {
      const ownerUsername =
        typeof query.owner === 'string' && query.owner.trim() !== '' ? validatePathPart(query.owner.trim(), 'owner') : undefined
      const textQuery = typeof query.q === 'string' ? query.q : undefined

      if (ownerUsername) {
        authorizeOwnerRead(ownerUsername, currentUser)
        return {
          bots: store.listBots({
            ownerUsernames: [ownerUsername],
            query: textQuery,
          }),
        }
      }

      const bots = [
        ...store.listBots({
          ownerUsernames: ['builtin'],
          query: textQuery,
        }),
      ]

      if (currentUser) {
        bots.push(
          ...store.listBots({
            ownerUsernames: [currentUser.username],
            query: textQuery,
          })
        )
      }

      return {
        bots: sortBots(bots),
      }
    },

    getBot(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      authorizeOwnerRead(ownerUsername, currentUser)
      const bot = store.getBot(ownerUsername, botName)
      if (!bot) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return bot
    },

    getBotSource(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      authorizeOwnerRead(ownerUsername, currentUser)
      const source = store.getBotSource(ownerUsername, botName)
      if (!source) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return source
    },

    saveBot(owner, name, body, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')

      if (ownerUsername === 'builtin') {
        throw createHttpError(403, 'FORBIDDEN', 'builtin bots are server-managed', {
          owner: ownerUsername,
          name: botName,
        })
      }

      requireAuthenticatedUser(currentUser, 'save bots')

      if (currentUser.username !== ownerUsername) {
        throw createHttpError(403, 'FORBIDDEN', 'you can only save bots for the authenticated user', {
          owner: ownerUsername,
          authenticatedUsername: currentUser.username,
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
      const existingBot = store.getBot(ownerUsername, botName)

      if (!existingBot && store.countOwnedBots(ownerUsername) >= STARTER_BOT_NAMES.length) {
        throw createHttpError(409, 'MAX_BOTS_REACHED', `users can only have ${STARTER_BOT_NAMES.length} bots`, {
          owner: ownerUsername,
          maxBots: STARTER_BOT_NAMES.length,
        })
      }

      return store.saveBot({
        ownerUsername,
        name: botName,
        sourceText: sourceTextSnapshot,
        sourceHash,
        saveMessage,
      })
    },

    listVersions(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      authorizeOwnerRead(ownerUsername, currentUser)
      const versions = store.listVersions(ownerUsername, botName)
      if (!versions) {
        throw createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
          owner: ownerUsername,
          name: botName,
        })
      }
      return versions
    },

    getVersionSource(owner, name, sourceHash, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      authorizeOwnerRead(ownerUsername, currentUser)

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
