import { gunzipSync, gzipSync } from 'node:zlib'

// Replays are stored as gzip + base64 text. A 4-bot match is ~200 KB as JSON and usually
// 3-20 KB compressed, so this is what keeps the database small.
// Records written before this codec hold a plain `replay` object; getReplay still reads them.

// Largest compressed replay we will store. Bigger ones are dropped (the match result is kept).
export const MAX_STORED_REPLAY_BYTES = 2_000_000

export function encodeReplay(replay) {
  return gzipSync(Buffer.from(JSON.stringify(replay), 'utf8')).toString('base64')
}

export function decodeReplay(encoded) {
  return JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
}

// Returns the value to store for a replay: { replayGz } or null when it is too large.
export function packReplay(replay) {
  if (replay == null) return { replayGz: null }
  const encoded = encodeReplay(replay)
  if (encoded.length > MAX_STORED_REPLAY_BYTES) return { replayGz: null }
  return { replayGz: encoded }
}

// Reads a stored replay from a match record, whichever format it was saved in.
export function readStoredReplay(match) {
  if (!match) return null
  if (typeof match.replayGz === 'string') return decodeReplay(match.replayGz)
  return match.replay ?? null
}
