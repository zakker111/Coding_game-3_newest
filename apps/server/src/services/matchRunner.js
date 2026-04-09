import { runMatchToReplay } from '@coding-game/engine'

export const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

function detectEndReason(replay) {
  for (let tick = replay.events.length - 1; tick >= 0; tick--) {
    const matchEnd = replay.events[tick]?.find((event) => event?.type === 'MATCH_END')
    if (matchEnd && typeof matchEnd.endReason === 'string') {
      return matchEnd.endReason
    }
  }

  return replay.tickCap >= 0 ? 'TICK_CAP' : null
}

function collectDeathOrder(replay) {
  const seen = new Set()
  const order = []

  for (const tickEvents of replay.events) {
    for (const event of tickEvents ?? []) {
      if (event?.type !== 'BOT_DIED' || typeof event.victimBotId !== 'string') continue
      if (seen.has(event.victimBotId)) continue
      seen.add(event.victimBotId)
      order.push(event.victimBotId)
    }
  }

  return order
}

export function summarizeReplayResult(replay) {
  const finalState = replay.state[replay.tickCap] ?? replay.state[replay.state.length - 1] ?? { bots: [] }
  const endReason = detectEndReason(replay)
  const deathOrder = collectDeathOrder(replay)
  const finalBotsById = new Map(finalState.bots.map((bot) => [bot.botId, bot]))

  const survivors = finalState.bots
    .filter((bot) => bot.alive)
    .map((bot) => ({
      slot: bot.botId,
      hp: bot.hp,
      ammo: bot.ammo,
      energy: bot.energy,
      alive: bot.alive,
    }))

  const survivorIds = new Set(survivors.map((bot) => bot.slot))
  const defeatedInOrder = [...deathOrder]
    .filter((botId) => !survivorIds.has(botId))
    .reverse()
    .map((botId) => finalBotsById.get(botId) ?? { botId, hp: 0, ammo: 0, energy: 0, alive: false })

  const placements = []

  if ((endReason === 'TICK_CAP' || endReason === 'STALEMATE') && survivors.length > 1) {
    const occupiedRanks = Array.from({ length: survivors.length }, (_, index) => index + 1)
    for (const survivor of survivors) {
      placements.push({
        botId: survivor.slot,
        placement: 1,
        tied: true,
        occupiedRanks,
        alive: true,
        hp: survivor.hp,
        ammo: survivor.ammo,
        energy: survivor.energy,
      })
    }

    let placement = survivors.length + 1
    for (const bot of defeatedInOrder) {
      placements.push({
        botId: bot.botId,
        placement,
        tied: false,
        occupiedRanks: [placement],
        alive: false,
        hp: bot.hp,
        ammo: bot.ammo,
        energy: bot.energy,
      })
      placement += 1
    }
  } else {
    let placement = 1
    for (const survivor of survivors) {
      placements.push({
        botId: survivor.slot,
        placement,
        tied: false,
        occupiedRanks: [placement],
        alive: true,
        hp: survivor.hp,
        ammo: survivor.ammo,
        energy: survivor.energy,
      })
      placement += 1
    }

    for (const bot of defeatedInOrder) {
      placements.push({
        botId: bot.botId,
        placement,
        tied: false,
        occupiedRanks: [placement],
        alive: false,
        hp: bot.hp,
        ammo: bot.ammo,
        energy: bot.energy,
      })
      placement += 1
    }
  }

  return {
    endReason,
    winnerSlot: survivors.length === 1 ? survivors[0].slot : null,
    survivors,
    placements,
  }
}

export function runStoredMatch({
  store,
  matchId,
  matchSeed,
  tickCap,
  participants,
  runMatch = runMatchToReplay,
  buildResult = summarizeReplayResult,
} = {}) {
  if (!store) {
    throw new Error('runStoredMatch requires a store')
  }

  store.markRunning(matchId)

  try {
    const replay = runMatch({
      seed: matchSeed,
      tickCap,
      bots: participants.map((participant) => ({
        slotId: participant.slot,
        sourceText: participant.sourceTextSnapshot,
        loadout: participant.loadoutSnapshot,
      })),
    })

    const result = buildResult(replay, participants)

    return store.markComplete(matchId, {
      result,
      replay,
    })
  } catch (error) {
    store.markFailed(matchId, {
      code: error?.code ?? 'SIMULATION_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
