import { compileBotSource, runMatchToReplay } from '@coding-game/engine'
import { LOADOUT_SLOT_COUNT, MODULE_DEFINITIONS, MODULE_IDS, normalizeLoadout, RULESET_VERSION } from '@coding-game/ruleset'

import { createSourceSnapshot } from './sourceText.js'

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']
const DISPLAY_NAME_MAX_LENGTH = 80

function createHttpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSlotId(value) {
  return SLOT_IDS.includes(value)
}

function normalizeDisplayName(input, slot) {
  if (typeof input !== 'string') return slot
  const trimmed = input.trim()
  if (trimmed === '') return slot
  return trimmed.slice(0, DISPLAY_NAME_MAX_LENGTH)
}

function validateSeed(seed) {
  if (typeof seed === 'string' && seed !== '') return seed
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed
  throw createHttpError(400, 'INVALID_REQUEST', 'seed must be a finite number or non-empty string', {
    field: 'seed',
  })
}

function validateTickCap(tickCap, config) {
  if (!Number.isInteger(tickCap) || tickCap < 0) {
    throw createHttpError(400, 'INVALID_REQUEST', 'tickCap must be a non-negative integer', {
      field: 'tickCap',
    })
  }
  if (tickCap > config.maxTickCap) {
    throw createHttpError(400, 'INVALID_REQUEST', `tickCap must be <= ${config.maxTickCap}`, {
      field: 'tickCap',
      maxTickCap: config.maxTickCap,
      actual: tickCap,
    })
  }
  return tickCap
}

function normalizeParticipants(input, config) {
  if (!Array.isArray(input) || input.length !== SLOT_IDS.length) {
    throw createHttpError(400, 'INVALID_REQUEST', 'participants must contain exactly four slot submissions', {
      field: 'participants',
    })
  }

  const bySlot = new Map()

  for (const participant of input) {
    if (!isPlainObject(participant)) {
      throw createHttpError(400, 'INVALID_REQUEST', 'each participant must be an object', {
        field: 'participants',
      })
    }

    if (!isSlotId(participant.slot)) {
      throw createHttpError(400, 'INVALID_REQUEST', `invalid participant slot: ${String(participant.slot)}`, {
        field: 'participants.slot',
      })
    }

    if (bySlot.has(participant.slot)) {
      throw createHttpError(400, 'INVALID_REQUEST', `duplicate participant slot: ${participant.slot}`, {
        field: 'participants.slot',
        slot: participant.slot,
      })
    }

    if (typeof participant.sourceText !== 'string') {
      throw createHttpError(400, 'INVALID_REQUEST', `participant ${participant.slot} must provide sourceText`, {
        field: 'participants.sourceText',
        slot: participant.slot,
      })
    }

    const { sourceTextSnapshot, sourceHash } = createSourceSnapshot(participant.sourceText, config)
    const compileResult = compileBotSource(sourceTextSnapshot)
    if (compileResult.errors.length > 0) {
      throw createHttpError(400, 'COMPILE_ERROR', `participant ${participant.slot} failed to compile`, {
        slot: participant.slot,
        errors: compileResult.errors,
      })
    }

    const { loadout, issues } = normalizeLoadout(participant.loadout)

    bySlot.set(participant.slot, {
      slot: participant.slot,
      displayName: normalizeDisplayName(participant.displayName, participant.slot),
      sourceTextSnapshot,
      sourceHash,
      loadoutSnapshot: loadout,
      loadoutIssues: issues,
    })
  }

  for (const slot of SLOT_IDS) {
    if (!bySlot.has(slot)) {
      throw createHttpError(400, 'INVALID_REQUEST', `missing participant for slot ${slot}`, {
        field: 'participants.slot',
        slot,
      })
    }
  }

  return SLOT_IDS.map((slot) => bySlot.get(slot))
}

function summarizeResult(replay) {
  const finalState = replay.state[replay.tickCap] ?? replay.state[replay.state.length - 1] ?? { bots: [] }
  const survivors = finalState.bots
    .filter((bot) => bot.alive)
    .map((bot) => ({
      slot: bot.botId,
      hp: bot.hp,
      ammo: bot.ammo,
      energy: bot.energy,
      alive: bot.alive,
    }))

  let endReason = null
  for (let tick = replay.events.length - 1; tick >= 0 && endReason == null; tick--) {
    const matchEnd = replay.events[tick]?.find((event) => event?.type === 'MATCH_END')
    if (matchEnd && typeof matchEnd.endReason === 'string') {
      endReason = matchEnd.endReason
    }
  }

  if (endReason == null) {
    endReason = replay.tickCap >= 0 ? 'TICK_CAP' : null
  }

  return {
    endReason,
    winnerSlot: survivors.length === 1 ? survivors[0].slot : null,
    survivors,
  }
}

export function createSimulationService({ store, config }) {
  if (!store) {
    throw new Error('createSimulationService requires a store')
  }

  return {
    getRuleset() {
      return {
        rulesetVersion: RULESET_VERSION,
        loadoutSlotCount: LOADOUT_SLOT_COUNT,
        modules: MODULE_IDS.map((id) => MODULE_DEFINITIONS[id]),
      }
    },

    createSimulation(input) {
      if (!isPlainObject(input)) {
        throw createHttpError(400, 'INVALID_REQUEST', 'request body must be a JSON object')
      }

      const seed = validateSeed(input.seed)
      const tickCap = validateTickCap(input.tickCap, config)
      const participants = normalizeParticipants(input.participants, config)

      const match = store.createMatch({
        matchSeed: seed,
        tickCap,
        participants,
      })

      store.markRunning(match.matchId)

      try {
        const replay = runMatchToReplay({
          seed,
          tickCap,
          bots: participants.map((participant) => ({
            slotId: participant.slot,
            sourceText: participant.sourceTextSnapshot,
            loadout: participant.loadoutSnapshot,
          })),
        })

        const result = summarizeResult(replay)

        return store.markComplete(match.matchId, {
          result,
          replay,
        })
      } catch (error) {
        store.markFailed(match.matchId, {
          code: error?.code ?? 'SIMULATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}
