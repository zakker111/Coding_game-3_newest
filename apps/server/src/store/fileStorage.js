import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Synchronous JSON-file storage. Used for local development and tests.
// load() returns the raw state object or null; save(state) writes the whole state.
export function createFileStorage(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('createFileStorage requires a non-empty filePath')
  }

  return {
    load() {
      try {
        return JSON.parse(readFileSync(filePath, 'utf8'))
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    },

    save(state) {
      mkdirSync(dirname(filePath), { recursive: true })
      const tempPath = `${filePath}.tmp`
      writeFileSync(tempPath, JSON.stringify(state, null, 2))
      renameSync(tempPath, filePath)
    },

    flush() {
      return Promise.resolve()
    },

    async close() {},
  }
}
