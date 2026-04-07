function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

export function createInMemoryMatchStore() {
  const matches = new Map()
  let nextId = 1

  function requireMatch(matchId) {
    const match = matches.get(matchId)
    if (!match) {
      throw new Error(`Unknown match: ${matchId}`)
    }
    return match
  }

  return {
    createMatch(meta) {
      const matchId = `m_${String(nextId).padStart(6, '0')}`
      nextId += 1

      const createdAt = new Date().toISOString()
      const match = {
        matchId,
        kind: 'sandbox',
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        result: null,
        replay: null,
        error: null,
        ...meta,
      }

      matches.set(matchId, match)
      return cloneRecord(match)
    },

    markRunning(matchId) {
      const match = requireMatch(matchId)
      match.status = 'running'
      match.updatedAt = new Date().toISOString()
      return cloneRecord(match)
    },

    markComplete(matchId, payload) {
      const match = requireMatch(matchId)
      match.status = 'complete'
      match.result = payload.result
      match.replay = payload.replay
      match.updatedAt = new Date().toISOString()
      return cloneRecord(match)
    },

    markFailed(matchId, error) {
      const match = requireMatch(matchId)
      match.status = 'failed'
      match.error = error
      match.updatedAt = new Date().toISOString()
      return cloneRecord(match)
    },

    getMatch(matchId) {
      return cloneRecord(matches.get(matchId) ?? null)
    },

    getReplay(matchId) {
      const match = matches.get(matchId)
      return cloneRecord(match?.replay ?? null)
    },
  }
}
