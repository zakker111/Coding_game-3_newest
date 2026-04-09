import { randomBytes } from 'node:crypto'

function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

export function createInMemoryUserStore() {
  const usersById = new Map()
  const usersByUsername = new Map()
  const sessions = new Map()
  let nextUserId = 1

  return {
    createUser({ username, passwordHash }) {
      const createdAt = new Date().toISOString()
      const user = {
        id: `u_${String(nextUserId).padStart(6, '0')}`,
        username,
        passwordHash,
        createdAt,
      }
      nextUserId += 1
      usersById.set(user.id, user)
      usersByUsername.set(user.username, user)
      return cloneRecord(user)
    },

    getUserByUsername(username) {
      return cloneRecord(usersByUsername.get(username) ?? null)
    },

    getUserById(userId) {
      return cloneRecord(usersById.get(userId) ?? null)
    },

    createSession({ userId }) {
      const session = {
        sessionId: randomBytes(24).toString('hex'),
        userId,
        createdAt: new Date().toISOString(),
      }
      sessions.set(session.sessionId, session)
      return cloneRecord(session)
    },

    getSession(sessionId) {
      return cloneRecord(sessions.get(sessionId) ?? null)
    },

    deleteSession(sessionId) {
      sessions.delete(sessionId)
    },
  }
}
