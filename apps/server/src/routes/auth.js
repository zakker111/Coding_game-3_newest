import { randomUUID } from 'node:crypto'

import { createBot, countBotsForUser } from '../db/queries/bots.js'
import { getSessionUser, SESSION_COOKIE_NAME, clearSession, createUserSession, authenticateUser, isValidPassword, isValidUsername, normalizeUsername, registerUser, MAX_USER_BOTS } from '../lib/auth.js'
import { loadBuiltinBots } from '../lib/builtinBots.js'

const STARTER_LOADOUT = ['BULLET', null, null]

async function ensureStarterBots(db, user) {
  const existingCount = await countBotsForUser(db, user.id)
  if (existingCount >= MAX_USER_BOTS) return

  const builtins = await loadBuiltinBots()
  const starterSource = builtins.find((bot) => bot.botId === 'builtin/aggressive-skirmisher')?.sourceText
  if (!starterSource) {
    throw new Error('starter_bot_missing')
  }

  for (let index = existingCount + 1; index <= MAX_USER_BOTS; index++) {
    const name = `bot${index}`
    await createBot(db, {
      id: randomUUID(),
      userId: user.id,
      ownerUsername: user.username,
      name,
      botId: `${user.username}/${name}`,
      sourceText: starterSource,
      sourceHash: builtins[0].sourceHash,
      latestLoadout: STARTER_LOADOUT,
    })
  }
}

async function readAuthenticatedUser(app, request) {
  if (!app.db) return null
  return getSessionUser(app.db, request.cookies[SESSION_COOKIE_NAME])
}

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: expiresAt,
  })
}

function clearSessionCookie(reply) {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })
}

function requireDb(app, reply) {
  if (app.db) return true
  reply.code(503)
  reply.send({ error: 'database_unavailable' })
  return false
}

export async function registerAuthRoutes(app) {
  app.get('/api/me', async (request) => ({
    user: await readAuthenticatedUser(app, request),
  }))

  app.post('/api/auth/register', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const username = normalizeUsername(request.body?.username)
    const password = request.body?.password

    if (!isValidUsername(username)) {
      reply.code(400)
      return { error: 'invalid_username' }
    }

    if (!isValidPassword(password)) {
      reply.code(400)
      return { error: 'invalid_password' }
    }

    const existing = await app.db.query('select 1 from users where username = $1 limit 1', [username])
    if (existing.rows.length > 0) {
      reply.code(409)
      return { error: 'username_taken' }
    }

    const user = await registerUser(app.db, { username, password })
    await ensureStarterBots(app.db, user)

    const session = await createUserSession(app.db, user.id, app.configValues.sessionTtlHours)
    setSessionCookie(reply, session.token, session.expiresAt)

    reply.code(201)
    return { user }
  })

  app.post('/api/auth/login', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    const username = normalizeUsername(request.body?.username)
    const password = request.body?.password

    const user = await authenticateUser(app.db, { username, password })
    if (!user) {
      reply.code(401)
      return { error: 'invalid_credentials' }
    }

    await ensureStarterBots(app.db, user)

    const session = await createUserSession(app.db, user.id, app.configValues.sessionTtlHours)
    setSessionCookie(reply, session.token, session.expiresAt)

    return {
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at,
      },
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    if (!requireDb(app, reply)) return reply

    await clearSession(app.db, request.cookies[SESSION_COOKIE_NAME])
    clearSessionCookie(reply)
    return { ok: true }
  })
}
