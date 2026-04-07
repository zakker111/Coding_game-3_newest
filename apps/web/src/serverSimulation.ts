import type { Replay, SlotId } from '@coding-game/replay'
import type { Loadout, LoadoutIssue } from '@coding-game/ruleset'

export const DEFAULT_SERVER_BASE_URL = 'http://127.0.0.1:3000'

export type ServerRulesetResponse = {
  rulesetVersion: string
  loadoutSlotCount: number
  modules: Array<{
    id: string
    itemKind: string
    family: string
    activation: string
    targetKinds: string[]
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

export function normalizeServerBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/g, '')
  return trimmed || DEFAULT_SERVER_BASE_URL
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
