import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import { deleteSessionByTokenHash, findSessionUserByTokenHash, createSession } from '../db/queries/sessions.js'
import { createUser, findUserById, findUserByUsername } from '../db/queries/users.js'
import { sha256Hex } from './hash.js'

const scrypt = promisify(scryptCallback)

export const SESSION_COOKIE_NAME = 'nowt_session'
export const MAX_USER_BOTS = 3

function encodePasswordHash(saltHex, digestHex) {
  return `${saltHex}:${digestHex}`
}

function decodePasswordHash(passwordHash) {
  const [saltHex, digestHex] = String(passwordHash ?? '').split(':')
  if (!saltHex || !digestHex) {
    throw new Error('Invalid password hash format')
  }

  return {
    saltHex,
    digestHex,
  }
}

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidUsername(value) {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(value)
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 8
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const digest = await scrypt(password, salt, 64)
  return encodePasswordHash(salt.toString('hex'), Buffer.from(digest).toString('hex'))
}

export async function verifyPassword(password, passwordHash) {
  const { saltHex, digestHex } = decodePasswordHash(passwordHash)
  const actual = Buffer.from(digestHex, 'hex')
  const candidate = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), actual.length))

  return actual.length === candidate.length && timingSafeEqual(actual, candidate)
}

export async function registerUser(db, { username, password }) {
  const normalizedUsername = normalizeUsername(username)

  if (!isValidUsername(normalizedUsername)) {
    throw new Error('invalid_username')
  }

  if (!isValidPassword(password)) {
    throw new Error('invalid_password')
  }

  const passwordHash = await hashPassword(password)
  return createUser(db, {
    id: randomUUID(),
    username: normalizedUsername,
    passwordHash,
  })
}

export async function authenticateUser(db, { username, password }) {
  const normalizedUsername = normalizeUsername(username)
  const user = await findUserByUsername(db, normalizedUsername)
  if (!user) return null

  const isValid = await verifyPassword(password, user.password_hash)
  if (!isValid) return null

  return user
}

export async function createUserSession(db, userId, sessionTtlHours) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000)

  await createSession(db, {
    id: randomUUID(),
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
  })

  return {
    token,
    expiresAt,
  }
}

export async function getSessionUser(db, token) {
  if (!token) return null

  const sessionUser = await findSessionUserByTokenHash(db, sha256Hex(token))
  if (!sessionUser) return null

  const user = await findUserById(db, sessionUser.user_id)
  return user ? { ...user, username: sessionUser.username } : null
}

export async function clearSession(db, token) {
  if (!token) return
  await deleteSessionByTokenHash(db, sha256Hex(token))
}
