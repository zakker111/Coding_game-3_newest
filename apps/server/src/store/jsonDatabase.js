import { createPersistentStoreBundle } from './persistentStoreBundle.js'

export function createJsonDatabase({ filePath, storage }) {
  return createPersistentStoreBundle({ filePath, storage })
}
