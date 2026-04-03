import { createHash } from 'node:crypto'

/**
 * @param {string} s
 */
export function sha256Hex(s) {
  return createHash('sha256').update(s).digest('hex')
}
