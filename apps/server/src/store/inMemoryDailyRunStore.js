function cloneRecord(record) {
  return record == null ? null : structuredClone(record)
}

export function createInMemoryDailyRunStore() {
  const runs = new Map()
  let nextId = 1

  function requireRun(runId) {
    const run = runs.get(runId)
    if (!run) {
      throw new Error(`Unknown daily run: ${runId}`)
    }
    return run
  }

  return {
    createRun(meta) {
      const runId = `d_${String(nextId).padStart(6, '0')}`
      nextId += 1

      const createdAt = new Date().toISOString()
      const run = {
        runId,
        status: 'planned',
        createdAt,
        updatedAt: createdAt,
        matchIds: [],
        summary: null,
        error: null,
        ...meta,
      }

      runs.set(runId, run)
      return cloneRecord(run)
    },

    markRunning(runId) {
      const run = requireRun(runId)
      run.status = 'running'
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    markComplete(runId, payload) {
      const run = requireRun(runId)
      run.status = 'complete'
      run.matchIds = payload.matchIds
      run.summary = payload.summary
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    markFailed(runId, error) {
      const run = requireRun(runId)
      run.status = 'failed'
      run.error = error
      run.updatedAt = new Date().toISOString()
      return cloneRecord(run)
    },

    getRun(runId) {
      return cloneRecord(runs.get(runId) ?? null)
    },

    listRuns() {
      return cloneRecord([...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },
  }
}
