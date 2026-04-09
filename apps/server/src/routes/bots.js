import { randomUUID } from 'node:crypto'

import { compileBotSource } from '@coding-game/engine'
import { normalizeLoadout } from '@coding-game/ruleset'

import { getBotByOwnerAndName, listVisibleBots, updateBotSource, createBot, countBotsForUser } from '../db/queries/bots.js'
import { getBotVersionSource, insertBotVersion, listBotVersions } from '../db/queries/botVersions.js'
import { SESSION_COOKIE_NAME, getSessionUser, MAX_USER_BOTS } from '../lib/auth.js'
import { canonicalizeSource } from '../lib/canonicalizeSource.js'
import { sha256Hex } from '../lib/hash.js'

async function readViewer(app, request) {
  if (!app.db) return null
  return getSessionUser(app.db, request.cookies[SESSION_COOKIE_NAME])
}

function requireDb(app, reply) {
  if (app.db) return true
  reply.code(503)
  reply.send({ error: 'database_unavailable' })
  return false
}

function isVisibleTo(viewer, ownerUsername) {
  return ownerUsername === 'builtin' || (viewer && viewer.username === ownerUsername)
}

function serializeBot(bot) {
  return {
    botId: bot.botId,
    owner_username: bot.owner_username,
    name: bot.name,
    updated_at: bot.updated_at,
    source_hash: bot.source_hash,
    loadout: bot.loadout,
  }
}

export async function registerBotRoutes(app) {
  app.get('/api/bots', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    const owner = typeof request.query?.owner === 'string' ? request.query.owner : null
    const query = typeof request.query?.q === 'string' ? request.query.q : ''

    if (owner && owner !== 'builtin' && (!viewer || owner !== viewer.username)) {
      reply.code(403)
      return { error: 'forbidden' }
    }

    const bots = await listVisibleBots(app.db, {
      viewerUsername: viewer?.username ?? null,
      owner,
      query,
    })

    return {
      bots: bots.map(serializeBot),
    }
  })

  app.get('/api/bots/:owner/:name', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    const bot = await getBotByOwnerAndName(app.db, request.params.owner, request.params.name)

    if (!bot || !isVisibleTo(viewer, bot.owner_username)) {
      reply.code(404)
      return { error: 'bot_not_found' }
    }

    return {
      bot: serializeBot(bot),
    }
  })

  app.get('/api/bots/:owner/:name/source', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    const bot = await getBotByOwnerAndName(app.db, request.params.owner, request.params.name)

    if (!bot || !isVisibleTo(viewer, bot.owner_username)) {
      reply.code(404)
      return { error: 'bot_not_found' }
    }

    return {
      botId: bot.botId,
      source_text: bot.source_text,
    }
  })

  app.put('/api/bots/:owner/:name', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    if (!viewer || viewer.username !== request.params.owner) {
      reply.code(403)
      return { error: 'forbidden' }
    }

    const sourceText = canonicalizeSource(request.body?.source_text)
    if (!sourceText) {
      reply.code(400)
      return { error: 'invalid_source_text' }
    }

    const compile = compileBotSource(sourceText)
    if (compile.errors.length > 0) {
      reply.code(400)
      return { error: 'compile_error', errors: compile.errors }
    }

    const existingBot = await getBotByOwnerAndName(app.db, request.params.owner, request.params.name)
    if (!existingBot) {
      const count = await countBotsForUser(app.db, viewer.id)
      if (count >= MAX_USER_BOTS) {
        reply.code(409)
        return { error: 'bot_limit_reached' }
      }
    }

    const normalizedLoadout = normalizeLoadout(request.body?.loadout ?? existingBot?.loadout ?? [null, null, null])
    const sourceHash = sha256Hex(sourceText)

    const bot =
      existingBot == null
        ? await createBot(app.db, {
            id: randomUUID(),
            userId: viewer.id,
            ownerUsername: viewer.username,
            name: request.params.name,
            botId: `${viewer.username}/${request.params.name}`,
            sourceText,
            sourceHash,
            latestLoadout: normalizedLoadout.loadout,
          })
        : await updateBotSource(app.db, {
            ownerUsername: viewer.username,
            name: request.params.name,
            sourceText,
            sourceHash,
            latestLoadout: normalizedLoadout.loadout,
          })

    await insertBotVersion(app.db, {
      id: randomUUID(),
      botRowId: bot.id,
      sourceHash,
      sourceText,
      loadoutSnapshot: normalizedLoadout.loadout,
      saveMessage: typeof request.body?.save_message === 'string' ? request.body.save_message : null,
    })

    return {
      bot: serializeBot(bot),
      loadout_issues: normalizedLoadout.issues,
    }
  })

  app.get('/api/bots/:owner/:name/versions', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    const bot = await getBotByOwnerAndName(app.db, request.params.owner, request.params.name)

    if (!bot || !isVisibleTo(viewer, bot.owner_username)) {
      reply.code(404)
      return { error: 'bot_not_found' }
    }

    return {
      botId: bot.botId,
      versions: await listBotVersions(app.db, bot.id),
    }
  })

  app.get('/api/bots/:owner/:name/versions/:sourceHash/source', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const viewer = await readViewer(app, request)
    const bot = await getBotByOwnerAndName(app.db, request.params.owner, request.params.name)

    if (!bot || !isVisibleTo(viewer, bot.owner_username)) {
      reply.code(404)
      return { error: 'bot_not_found' }
    }

    const version = await getBotVersionSource(app.db, bot.id, request.params.sourceHash)
    if (!version) {
      reply.code(404)
      return { error: 'version_not_found' }
    }

    return {
      botId: bot.botId,
      source_hash: version.source_hash,
      source_text: version.source_text,
    }
  })
}
