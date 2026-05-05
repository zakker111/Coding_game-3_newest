import { createPersistentStoreBundle } from './persistentStoreBundle.js'

export function createJsonDatabase({ filePath }) {
  return createPersistentStoreBundle({ filePath })
}
