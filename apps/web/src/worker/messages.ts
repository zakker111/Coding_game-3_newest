import { isLoadout } from '@coding-game/ruleset'
import type { Loadout, Replay, SlotId } from '@coding-game/replay'

export type BotSpec = {
  slotId: SlotId
  sourceText: string

  /** Per-bot 3-slot loadout (authoritative for rulesetVersion >= 0.2.0). */
  loadout: Loadout
}

export type RunLocalMessage = {
  type: 'RUN_LOCAL'
  requestId: number
  seed: number
  tickCap: number
  bots: BotSpec[]
  inactiveSlots?: SlotId[]
}

export type RunServerMirrorMessage = {
  type: 'RUN_SERVER_MIRROR'
  requestId: number
  seed: number | string
  tickCap: number
  bots: BotSpec[]
}

export type RunResultMessage = {
  type: 'RUN_RESULT'
  requestId: number
  replay: Replay
}

export type RunServerMirrorResultMessage = {
  type: 'RUN_SERVER_MIRROR_RESULT'
  requestId: number
  replay: Replay
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isSlotId(v: unknown): v is SlotId {
  return v === 'BOT1' || v === 'BOT2' || v === 'BOT3' || v === 'BOT4'
}

function isInactiveSlots(v: unknown): v is SlotId[] {
  return Array.isArray(v) && v.every(isSlotId)
}

function isBotSpec(v: unknown): v is BotSpec {
  if (!isRecord(v)) return false
  return isSlotId(v.slotId) && typeof v.sourceText === 'string' && isLoadout(v.loadout)
}

function isReplay(v: unknown): v is Replay {
  if (!isRecord(v)) return false
  if (typeof v.schemaVersion !== 'string') return false
  if (typeof v.rulesetVersion !== 'string') return false
  if (typeof v.ticksPerSecond !== 'number') return false
  if (typeof v.tickCap !== 'number') return false
  if (!Array.isArray(v.bots)) return false
  if (!Array.isArray(v.state)) return false
  if (!Array.isArray(v.events)) return false
  return true
}

export function isRunLocalMessage(v: unknown): v is RunLocalMessage {
  if (!isRecord(v)) return false
  if (v.type !== 'RUN_LOCAL') return false
  if (typeof v.requestId !== 'number') return false
  if (typeof v.seed !== 'number') return false
  if (typeof v.tickCap !== 'number') return false
  if (!Array.isArray(v.bots) || !v.bots.every(isBotSpec)) return false
  if (v.inactiveSlots != null && !isInactiveSlots(v.inactiveSlots)) return false
  return true
}

export function isRunServerMirrorMessage(v: unknown): v is RunServerMirrorMessage {
  if (!isRecord(v)) return false
  if (v.type !== 'RUN_SERVER_MIRROR') return false
  if (typeof v.requestId !== 'number') return false
  if (!(typeof v.seed === 'number' || typeof v.seed === 'string')) return false
  if (typeof v.tickCap !== 'number') return false
  if (!Array.isArray(v.bots) || !v.bots.every(isBotSpec)) return false
  return true
}

export function isRunResultMessage(v: unknown): v is RunResultMessage {
  if (!isRecord(v)) return false
  if (v.type !== 'RUN_RESULT') return false
  if (typeof v.requestId !== 'number') return false
  return isReplay(v.replay)
}

export function isRunServerMirrorResultMessage(v: unknown): v is RunServerMirrorResultMessage {
  if (!isRecord(v)) return false
  if (v.type !== 'RUN_SERVER_MIRROR_RESULT') return false
  if (typeof v.requestId !== 'number') return false
  return isReplay(v.replay)
}
