import { gunzipSync, gzipSync } from 'node:zlib'

import { sha256Hex } from './hash.js'

export function encodeReplayPayload(replay) {
  const json = JSON.stringify(replay)
  const gzipBytes = gzipSync(Buffer.from(json, 'utf8'))

  return {
    encoding: 'gzip',
    sha256: sha256Hex(json),
    replayBytes: gzipBytes,
  }
}

export function decodeReplayPayload(blob) {
  if (!blob) return null

  const storedBytes = Buffer.isBuffer(blob.replay_bytes) ? blob.replay_bytes : Buffer.from(blob.replay_bytes)
  const utf8Text = storedBytes.toString('utf8')
  const bytes =
    blob.replay_base64 || /^[A-Za-z0-9+/=]+$/.test(utf8Text)
      ? Buffer.from(blob.replay_base64 ?? utf8Text, 'base64')
      : storedBytes
  const json =
    blob.encoding === 'gzip' ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')

  return JSON.parse(json)
}
