import { EMPTY_LOADOUT, normalizeLoadout } from '@coding-game/ruleset'

import { createSourceSnapshot } from './sourceText.js'
import { BOT_VISIBILITIES, normalizeVisibility } from './botMeta.js'

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

// Builtin bots are always visible. Other bots are visible to their owner, and to
// everyone else only when public.
function canViewBot(bot, currentUser) {
  if (!bot) return false
  if (bot.ownerUsername === 'builtin') return true
  if (currentUser && currentUser.username === bot.ownerUsername) return true
  return normalizeVisibility(bot.visibility) === 'public'
}

function botNotFound(ownerUsername, botName) {
  return createHttpError(404, 'BOT_NOT_FOUND', 'Bot not found', {
    owner: ownerUsername,
    name: botName,
  })
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
      const starterLoadout = normalizeLoadout(store.getBotSource('builtin', 'bot0')?.loadout ?? EMPTY_LOADOUT).loadout

      for (const name of STARTER_BOT_NAMES) {
        if (store.getBot(ownerUsername, name)) continue
        const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(starterSource, config)
        store.saveBot({
          ownerUsername,
          name,
          sourceText: sourceTextSnapshot,
          sourceHash,
          loadout: starterLoadout,
          saveMessage: 'starter bot',
        })
      }
    },

    listBots(query = {}, { currentUser } = {}) {
      const ownerUsername =
        typeof query.owner === 'string' && query.owner.trim() !== '' ? validatePathPart(query.owner.trim(), 'owner') : undefined
      const textQuery = typeof query.q === 'string' ? query.q : undefined

      if (ownerUsername) {
        return {
          bots: store.listBots({
            ownerUsernames: [ownerUsername],
            query: textQuery,
          }).filter((bot) => canViewBot(bot, currentUser)),
        }
      }

      return {
        bots: sortBots(
          store.listBots({
            query: textQuery,
          }).filter((bot) => canViewBot(bot, currentUser))
        ),
      }
    },

    getBot(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const bot = store.getBot(ownerUsername, botName)
      if (!bot || !canViewBot(bot, currentUser)) {
        throw botNotFound(ownerUsername, botName)
      }
      return bot
    },

    getBotSource(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const bot = store.getBot(ownerUsername, botName)
      if (!bot || !canViewBot(bot, currentUser)) {
        throw botNotFound(ownerUsername, botName)
      }
      const source = store.getBotSource(ownerUsername, botName)
      if (!source) {
        throw botNotFound(ownerUsername, botName)
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

      if (body.visibility !== undefined && !BOT_VISIBILITIES.includes(body.visibility)) {
        throw createHttpError(400, 'INVALID_REQUEST', `visibility must be one of: ${BOT_VISIBILITIES.join(', ')}`, {
          field: 'visibility',
        })
      }

      const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(body.sourceText, config)
      const { loadout } = normalizeLoadout(body.loadout)
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
        loadout,
        saveMessage,
        visibility: body.visibility,
      })
    },

    // Copies a builtin or public bot into the forker's account. The copy starts
    // 'pending' in the daily league and records forkedFrom = 'owner/name'.
    // The target slot must exist and be owned by the forker unless it is free and
    // the forker is under the bot limit. Replacing an existing slot requires
    // overwrite: true; the replaced source stays in version history.
    forkBot(owner, name, body, { currentUser } = {}) {
      const sourceOwner = validatePathPart(owner, 'owner')
      const sourceName = validatePathPart(name, 'name')
      requireAuthenticatedUser(currentUser, 'fork bots')

      const source = store.getBot(sourceOwner, sourceName)
      if (!source || !canViewBot(source, currentUser)) throw botNotFound(sourceOwner, sourceName)
      if (sourceOwner !== 'builtin' && normalizeVisibility(source.visibility) !== 'public') {
        throw createHttpError(403, 'FORBIDDEN', 'only public bots can be forked', {
          owner: sourceOwner,
          name: sourceName,
        })
      }

      if (typeof body !== 'object' || body == null || Array.isArray(body)) {
        throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
      }
      const targetName = validatePathPart(body.name, 'name')
      if (body.overwrite !== undefined && typeof body.overwrite !== 'boolean') {
        throw createHttpError(400, 'INVALID_REQUEST', 'overwrite must be a boolean', { field: 'overwrite' })
      }

      const sourceSource = store.getBotSource(sourceOwner, sourceName)
      const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(sourceSource.sourceText, config)
      const { loadout } = normalizeLoadout(sourceSource.loadout)

      const existingTarget = store.getBot(currentUser.username, targetName)
      if (existingTarget && body.overwrite !== true) {
        throw createHttpError(409, 'BOT_EXISTS', `${currentUser.username}/${targetName} already exists; pass overwrite: true to replace it`, {
          owner: currentUser.username,
          name: targetName,
        })
      }
      if (!existingTarget && store.countOwnedBots(currentUser.username) >= STARTER_BOT_NAMES.length) {
        throw createHttpError(409, 'MAX_BOTS_REACHED', `users can only have ${STARTER_BOT_NAMES.length} bots`, {
          owner: currentUser.username,
          maxBots: STARTER_BOT_NAMES.length,
        })
      }

      const forkedFrom = `${sourceOwner}/${sourceName}`
      return store.saveBot({
        ownerUsername: currentUser.username,
        name: targetName,
        sourceText: sourceTextSnapshot,
        sourceHash,
        loadout,
        saveMessage: `Forked from ${forkedFrom}`,
        visibility: 'public',
        forkedFrom,
        forkBaseline: { sourceHash, loadout },
      })
    },

    listVersions(owner, name, { currentUser } = {}) {
      const ownerUsername = validatePathPart(owner, 'owner')
      const botName = validatePathPart(name, 'name')
      const visible = store.getBot(ownerUsername, botName)
      if (visible && !canViewBot(visible, currentUser)) throw botNotFound(ownerUsername, botName)
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

      if (typeof sourceHash !== 'string' || sourceHash.trim() === '') {
        throw createHttpError(400, 'INVALID_REQUEST', 'sourceHash must be a non-empty string', {
          field: 'sourceHash',
        })
      }

      const visible = store.getBot(ownerUsername, botName)
      if (visible && !canViewBot(visible, currentUser)) throw botNotFound(ownerUsername, botName)
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
