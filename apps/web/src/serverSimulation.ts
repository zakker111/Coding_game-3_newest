import { compileBotSource } from '@coding-game/engine'
import type { Replay, ReplayEvent, SlotId } from '@coding-game/replay'
import { LOADOUT_SLOT_COUNT, MODULE_DEFINITIONS, MODULE_IDS, normalizeLoadout, RULESET_VERSION } from '@coding-game/ruleset'
import type { Loadout, LoadoutIssue } from '@coding-game/ruleset'

import { runServerMirrorInWorker } from './worker/runLocalInWorker'

export const DEFAULT_SERVER_BASE_URL = 'http://127.0.0.1:3000'
export const LOCAL_SERVER_MIRROR_MODE = 'local-mirror'
const DEFAULT_MAX_TICK_CAP = 600
const DEFAULT_MAX_SOURCE_CHARS = 12000
const DEFAULT_MAX_SOURCE_LINES = 400
const DISPLAY_NAME_MAX_LENGTH = 80
const SLOT_IDS: readonly SlotId[] = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

export type ServerRulesetResponse = {
  rulesetVersion: string
  loadoutSlotCount: number
  modules: Array<{
    id: string
    itemKind: string
    family: string
    activation: string
    targetKinds: readonly string[]
    exclusiveGroup?: string
    uiLabel: string
  }>
}

export type ServerSimulationParticipantInput = {
  slot: SlotId
  displayName: string
  sourceText: string
  loadout: Loadout
}

export type ServerSimulationRequest = {
  seed: number | string
  tickCap: number
  participants: ServerSimulationParticipantInput[]
}

export type ServerSimulationResponse = {
  matchId: string
  kind: string
  status: string
  replayUrl: string
}

export type MirroredServerSimulationResult = {
  created: ServerSimulationResponse
  match: ServerMatchResponse
  replay: Replay
}

export type ServerMatchParticipantSnapshot = {
  slot: SlotId
  displayName: string
  sourceTextSnapshot: string
  sourceHash: string
  loadoutSnapshot: Loadout
  loadoutIssues: LoadoutIssue[]
}

export type ServerMatchResponse = {
  matchId: string
  kind: string
  status: string
  matchSeed: number | string
  tickCap: number
  result: {
    endReason: string | null
    winnerSlot: SlotId | null
    survivors: Array<{
      slot: SlotId
      hp: number
      ammo: number
      energy: number
      alive: boolean
    }>
  } | null
  participants: ServerMatchParticipantSnapshot[]
  createdAt: string
  updatedAt: string
  error?: {
    code?: string
    message?: string
  }
}

type FetchLike = typeof fetch

type ErrorPayload = {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

type MirrorRunnerDeps = {
  now?: () => string
  hashText?: (text: string) => Promise<string>
  runReplay?: typeof runServerMirrorInWorker
}

export function normalizeServerBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/g, '')
  return trimmed || DEFAULT_SERVER_BASE_URL
}

function countLines(text: string) {
  return text === '' ? 0 : text.split('\n').length
}

function normalizeSourceText(raw: string) {
  return String(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
}

function canonicalSourceForHash(sourceText: string) {
  const normalized = normalizeSourceText(sourceText).replace(/\n+$/g, '')
  if (normalized === '') return ''
  return `${normalized}\n`
}

function createMirrorError(statusCode: number, code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function validateSeed(seed: number | string) {
  if (typeof seed === 'string' && seed !== '') return seed
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed
  throw createMirrorError(400, 'INVALID_REQUEST', 'seed must be a finite number or non-empty string', {
    field: 'seed',
  })
}

function validateTickCap(tickCap: number) {
  if (!Number.isInteger(tickCap) || tickCap < 0) {
    throw createMirrorError(400, 'INVALID_REQUEST', 'tickCap must be a non-negative integer', {
      field: 'tickCap',
    })
  }
  if (tickCap > DEFAULT_MAX_TICK_CAP) {
    throw createMirrorError(400, 'INVALID_REQUEST', `tickCap must be <= ${DEFAULT_MAX_TICK_CAP}`, {
      field: 'tickCap',
      maxTickCap: DEFAULT_MAX_TICK_CAP,
      actual: tickCap,
    })
  }
  return tickCap
}

function validateSourceLimits(sourceText: string) {
  const lineCount = countLines(sourceText)

  if (sourceText.length > DEFAULT_MAX_SOURCE_CHARS) {
    throw createMirrorError(400, 'SOURCE_LIMIT_EXCEEDED', `Source exceeds ${DEFAULT_MAX_SOURCE_CHARS} characters`, {
      limit: DEFAULT_MAX_SOURCE_CHARS,
      actual: sourceText.length,
      kind: 'chars',
    })
  }

  if (lineCount > DEFAULT_MAX_SOURCE_LINES) {
    throw createMirrorError(400, 'SOURCE_LIMIT_EXCEEDED', `Source exceeds ${DEFAULT_MAX_SOURCE_LINES} lines`, {
      limit: DEFAULT_MAX_SOURCE_LINES,
      actual: lineCount,
      kind: 'lines',
    })
  }
}

function isSlotId(value: unknown): value is SlotId {
  return SLOT_IDS.includes(value as SlotId)
}

function normalizeDisplayName(input: unknown, slot: SlotId) {
  if (typeof input !== 'string') return slot
  const trimmed = input.trim()
  if (trimmed === '') return slot
  return trimmed.slice(0, DISPLAY_NAME_MAX_LENGTH)
}

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

let nextLocalMirrorMatchId = 1

function summarizeResult(replay: Replay) {
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

  let endReason: string | null = null
  for (let tick = replay.events.length - 1; tick >= 0 && endReason == null; tick--) {
    const matchEnd = replay.events[tick]?.find(
      (event): event is ReplayEvent & { type: 'MATCH_END'; endReason: string } => event?.type === 'MATCH_END',
    )
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

export function getLocalMirroredRuleset(): ServerRulesetResponse {
  return {
    rulesetVersion: RULESET_VERSION,
    loadoutSlotCount: LOADOUT_SLOT_COUNT,
    modules: MODULE_IDS.map((id) => MODULE_DEFINITIONS[id]),
  }
}

export async function runLocalMirroredServerSimulation(
  payload: ServerSimulationRequest,
  deps: MirrorRunnerDeps = {},
): Promise<MirroredServerSimulationResult> {
  const runReplay = deps.runReplay ?? runServerMirrorInWorker
  const now = deps.now ?? (() => new Date().toISOString())
  const hashText = deps.hashText ?? sha256Hex

  if (!Array.isArray(payload.participants) || payload.participants.length !== SLOT_IDS.length) {
    throw createMirrorError(400, 'INVALID_REQUEST', 'participants must contain exactly four slot submissions', {
      field: 'participants',
    })
  }

  const seed = validateSeed(payload.seed)
  const tickCap = validateTickCap(payload.tickCap)
  const bySlot = new Map<SlotId, ServerMatchParticipantSnapshot>()

  for (const participant of payload.participants) {
    if (!isSlotId(participant.slot)) {
      throw createMirrorError(400, 'INVALID_REQUEST', `invalid participant slot: ${String(participant.slot)}`, {
        field: 'participants.slot',
      })
    }
    if (bySlot.has(participant.slot)) {
      throw createMirrorError(400, 'INVALID_REQUEST', `duplicate participant slot: ${participant.slot}`, {
        field: 'participants.slot',
        slot: participant.slot,
      })
    }
    if (typeof participant.sourceText !== 'string') {
      throw createMirrorError(400, 'INVALID_REQUEST', `participant ${participant.slot} must provide sourceText`, {
        field: 'participants.sourceText',
        slot: participant.slot,
      })
    }

    const sourceTextSnapshot = normalizeSourceText(participant.sourceText)
    validateSourceLimits(sourceTextSnapshot)
    const sourceHash = await hashText(canonicalSourceForHash(sourceTextSnapshot))

    const compileResult = compileBotSource(sourceTextSnapshot)
    if (compileResult.errors.length > 0) {
      throw createMirrorError(400, 'COMPILE_ERROR', `participant ${participant.slot} failed to compile`, {
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
      throw createMirrorError(400, 'INVALID_REQUEST', `missing participant for slot ${slot}`, {
        field: 'participants.slot',
        slot,
      })
    }
  }

  const participants = SLOT_IDS.map((slot) => bySlot.get(slot)!)
  const matchId = `m_${String(nextLocalMirrorMatchId).padStart(6, '0')}`
  nextLocalMirrorMatchId += 1
  const createdAt = now()

  const replay = await runReplay({
    seed,
    tickCap,
    bots: participants.map((participant) => ({
      slotId: participant.slot,
      sourceText: participant.sourceTextSnapshot,
      loadout: participant.loadoutSnapshot,
    })),
  })
  const updatedAt = now()
  const result = summarizeResult(replay)

  return {
    created: {
      matchId,
      kind: 'sandbox',
      status: 'complete',
      replayUrl: `/api/matches/${matchId}/replay`,
    },
    match: {
      matchId,
      kind: 'sandbox',
      status: 'complete',
      matchSeed: seed,
      tickCap,
      result,
      participants,
      createdAt,
      updatedAt,
    },
    replay,
  }
}

function buildApiUrl(baseUrl: string, path: string) {
  return `${normalizeServerBaseUrl(baseUrl)}${path}`
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await fetchImpl(buildApiUrl(baseUrl, path), {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  let payload: T | ErrorPayload | null = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && payload.error?.message
        ? payload.error.message
        : `Request failed with status ${response.status}`
    throw new Error(errorMessage)
  }

  return payload as T
}

export async function fetchServerRuleset(baseUrl: string, fetchImpl?: FetchLike): Promise<ServerRulesetResponse> {
  return requestJson<ServerRulesetResponse>(baseUrl, '/api/ruleset', { method: 'GET' }, fetchImpl)
}

export async function createServerSimulation(
  baseUrl: string,
  payload: ServerSimulationRequest,
  fetchImpl?: FetchLike,
): Promise<ServerSimulationResponse> {
  return requestJson<ServerSimulationResponse>(
    baseUrl,
    '/api/simulations',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    fetchImpl,
  )
}

export async function fetchServerMatch(baseUrl: string, matchId: string, fetchImpl?: FetchLike): Promise<ServerMatchResponse> {
  return requestJson<ServerMatchResponse>(baseUrl, `/api/matches/${encodeURIComponent(matchId)}`, { method: 'GET' }, fetchImpl)
}

export async function fetchServerReplay(baseUrl: string, matchId: string, fetchImpl?: FetchLike): Promise<Replay> {
  return requestJson<Replay>(baseUrl, `/api/matches/${encodeURIComponent(matchId)}/replay`, { method: 'GET' }, fetchImpl)
}
