import { claimNextQueuedMatch, markMatchComplete, markMatchFailed } from '../db/queries/matches.js'
import { upsertReplayBlob } from '../db/queries/replays.js'
import { encodeReplayPayload } from '../lib/replayStore.js'
import { runServerMatch, summarizeReplay } from '../lib/runServerMatch.js'

export async function processNextQueuedMatch({ db, logger }) {
  const match = await claimNextQueuedMatch(db)
  if (!match) return null

  try {
    const replay = runServerMatch(match)
    const result = summarizeReplay(replay)
    const replayBlob = encodeReplayPayload(replay)

    await upsertReplayBlob(db, {
      matchId: match.id,
      encoding: replayBlob.encoding,
      sha256: replayBlob.sha256,
      replayBytes: replayBlob.replayBytes,
    })

    const completed = await markMatchComplete(db, match.id, result)
    return {
      match: completed,
      replay,
    }
  } catch (error) {
    await markMatchFailed(db, match.id, {
      message: String(error?.message ?? error),
    })
    logger?.error?.({ err: error, matchId: match.id }, 'match processing failed')
    throw error
  }
}

export function startMatchWorker({ config, db, logger }) {
  let timer = null
  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      await processNextQueuedMatch({ db, logger })
    } catch {
      // keep polling; failure was already recorded and logged
    } finally {
      timer = setTimeout(tick, config.queuePollMs)
    }
  }

  timer = setTimeout(tick, config.queuePollMs)

  return async function stopWorker() {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}
