import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const MIN_PASSWORD_LENGTH = 5
const SESSION_COOKIE_NAME = 'nowt_session'
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin'

function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const digest = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash).split(':')
  if (!salt || !expectedHex) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim() === '') return {}

  const out = {}
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (!rawName) continue
    out[rawName] = rawValue.join('=')
  }
  return out
}

function normalizeUsername(value) {
  if (typeof value !== 'string' || !USERNAME_PATTERN.test(value)) {
    throw createHttpError(400, 'INVALID_REQUEST', `username must match ${USERNAME_PATTERN}`, {
      field: 'username',
    })
  }
  return value
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw createHttpError(
      400,
      'INVALID_REQUEST',
      `password must be a string with at least ${MIN_PASSWORD_LENGTH} characters`,
      {
        field: 'password',
        minLength: MIN_PASSWORD_LENGTH,
      }
    )
  }
  return value
}

function validateAuthBody(body) {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) {
    throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
  }

  return {
    username: normalizeUsername(body.username),
    password: validatePassword(body.password),
  }
}

const MIN_ADMIN_PASSWORD_LENGTH = 12

function validateAdminPasswordStrength(password) {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`NOWT_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`)
  }
  if (password === DEFAULT_ADMIN_PASSWORD) {
    throw new Error('NOWT_ADMIN_PASSWORD must not be the default password')
  }
}

function toSessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  }
}

export function createAuthService({ store, config = {} } = {}) {
  if (!store) {
    throw new Error('createAuthService requires a store')
  }

  const sessionTtlMs = Number.isFinite(config.sessionTtlMs) ? config.sessionTtlMs : null
  const requireStrongAdminPassword = config.requireStrongAdminPassword === true
  const secureCookie = config.secureCookies === true || process.env.NODE_ENV === 'production'
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`

  return {
    // Production: the admin password comes from config.adminPassword (NOWT_ADMIN_PASSWORD) and is
    // applied on every start, so an old default password can never survive. With no admin
    // password configured in production, no admin account is created at all.
    // Development/tests: admin/admin is created when missing, as before.
    ensureDefaultAdmin() {
      const configuredPassword = typeof config.adminPassword === 'string' && config.adminPassword !== '' ? config.adminPassword : null

      if (requireStrongAdminPassword) {
        if (!configuredPassword) {
          console.warn('NOWT_ADMIN_PASSWORD is not set: no admin account is available in production.')
          return null
        }
        validateAdminPasswordStrength(configuredPassword)
        const existing = store.getUserByUsername(DEFAULT_ADMIN_USERNAME)
        if (!existing) {
          return toSessionUser(
            store.createUser({
              username: DEFAULT_ADMIN_USERNAME,
              passwordHash: hashPassword(configuredPassword),
            })
          )
        }
        if (!verifyPassword(configuredPassword, existing.passwordHash)) {
          store.setPasswordHash(DEFAULT_ADMIN_USERNAME, hashPassword(configuredPassword))
        }
        return toSessionUser(store.getUserByUsername(DEFAULT_ADMIN_USERNAME))
      }

      const devPassword = configuredPassword ?? DEFAULT_ADMIN_PASSWORD
      const existing = store.getUserByUsername(DEFAULT_ADMIN_USERNAME)
      if (existing) return null
      return toSessionUser(
        store.createUser({
          username: DEFAULT_ADMIN_USERNAME,
          passwordHash: hashPassword(devPassword),
        })
      )
    },

    getCurrentUser(cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader)
      const sessionId = cookies[SESSION_COOKIE_NAME]
      if (!sessionId) return null

      const session = store.getSession(sessionId)
      if (!session) return null

      if (typeof session.expiresAt === 'string' && Date.parse(session.expiresAt) <= Date.now()) {
        store.deleteSession(sessionId)
        return null
      }

      const user = store.getUserById(session.userId)
      return user ? toSessionUser(user) : null
    },

    register(body) {
      const { username, password } = validateAuthBody(body)

      if (store.getUserByUsername(username)) {
        throw createHttpError(409, 'USER_EXISTS', 'username is already registered', {
          field: 'username',
        })
      }

      const user = store.createUser({
        username,
        passwordHash: hashPassword(password),
      })
      const session = store.createSession({
        userId: user.id,
        expiresAt: sessionTtlMs ? new Date(Date.now() + sessionTtlMs).toISOString() : undefined,
      })

      return {
        user: toSessionUser(user),
        sessionId: session.sessionId,
      }
    },

    login(body) {
      const { username, password } = validateAuthBody(body)
      const user = store.getUserByUsername(username)

      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw createHttpError(401, 'INVALID_CREDENTIALS', 'invalid username or password')
      }

      const session = store.createSession({
        userId: user.id,
        expiresAt: sessionTtlMs ? new Date(Date.now() + sessionTtlMs).toISOString() : undefined,
      })

      return {
        user: toSessionUser(user),
        sessionId: session.sessionId,
      }
    },

    logout(cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader)
      const sessionId = cookies[SESSION_COOKIE_NAME]
      if (sessionId) {
        store.deleteSession(sessionId)
      }
    },

    setSessionCookie(reply, sessionId) {
      reply.header('set-cookie', `${SESSION_COOKIE_NAME}=${sessionId}; ${cookieFlags}`)
    },

    clearSessionCookie(reply) {
      reply.header('set-cookie', `${SESSION_COOKIE_NAME}=; ${cookieFlags}; Max-Age=0`)
    },
  }
}
