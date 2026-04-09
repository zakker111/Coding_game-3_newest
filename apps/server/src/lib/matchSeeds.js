import { sha256Hex } from './hash.js'

export function deriveMatchSeed(runSeed, matchIndex = 0) {
  return sha256Hex(`${String(runSeed)}:${matchIndex}`).slice(0, 16)
}
