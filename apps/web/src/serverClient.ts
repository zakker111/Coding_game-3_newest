import { normalizeServerBaseUrl } from './serverSimulation'
import type { Loadout } from '@coding-game/ruleset'

type FetchLike = typeof fetch

type ErrorPayload = {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

export type ServerUser = {
  id: string
  username: string
  createdAt: string
}

export type ServerMeResponse = {
  user: ServerUser | null
}

export type ServerAuthResponse = {
  user: ServerUser
}

export type ServerBotSummary = {
  botId: string
  ownerUsername: string
  name: string
  updatedAt: string | null
  sourceHash: string | null
  loadout: Loadout
  rankedEnabled: boolean
  rankedStatus: 'active' | 'pending' | 'dropped'
  rankedPoints: number
  lastRankedRunId: string | null
  lastSubmittedAt: string | null
  droppedAt: string | null
  dropReason: string | null
}

export type ServerBotListResponse = {
  bots: ServerBotSummary[]
}

export type RankedStatusBadge = {
  label: string
  tone: 'good' | 'warn' | 'bad'
  detail: string
}

const DROP_REASON_LABELS: Record<string, string> = {
  below_daily_cut: 'below the daily cutoff',
}

export function describeRankedStatus(bot: Pick<ServerBotSummary, 'rankedStatus' | 'dropReason'>): RankedStatusBadge {
  if (bot.rankedStatus === 'pending') {
    return {
      label: 'Pending',
      tone: 'warn',
      detail: 'Resubmitted — joins the next daily ranked run.',
    }
  }
  if (bot.rankedStatus === 'dropped') {
    // Drop reasons arrive in snake_case; keep the raw token visible so users can
    // match UI text against API responses, while capitalizing the human label.
    const raw = bot.dropReason ?? ''
    const known = DROP_REASON_LABELS[raw]
    // Known reasons read best with a lowercase lead-in ("Dropped below the daily cutoff").
    const sentence = known
      ? `Dropped ${known}`
      : raw
        ? `Dropped — ${raw.replace(/_/g, ' ')} (${raw})`
        : 'Dropped from the ranked ladder'
    return {
      label: 'Dropped',
      tone: 'bad',
      detail: `${sentence} — save an update to requeue as pending.`,
    }
  }
  return { label: 'Active', tone: 'good', detail: 'Playing in daily ranked runs.' }
}

export type ServerBotSourceResponse = {
  botId: string
  sourceText: string
  loadout: Loadout
}

export type ServerSaveBotRequest = {
  sourceText: string
  loadout: Loadout
  saveMessage?: string
}

export type ServerDailyRunSummary = {
  matchCount: number
  leaderboard: Array<{
    botId: string
    points: number
    matchesPlayed: number
    wins: number
    averagePoints: number
  }>
}

export type ServerDailyRun = {
  runId: string
  status: string
  runDate: string
  runSeed: string | number
  rulesetVersion: string
  maxRounds: number
  tickCap: number
  matchIds: string[]
  summary: ServerDailyRunSummary | null
  createdAt: string
  updatedAt: string
}

export type ServerDailyRunListResponse = {
  runs: ServerDailyRun[]
}

export type ServerDailyRunMatch = {
  matchId: string
  kind: string
  dailyRunId?: string
  status: string
  matchSeed: string | number
  tickCap: number
  result: {
    endReason: string | null
    winnerSlot: string | null
    placements?: Array<{
      slot: string
      rank: number
      points: number
      alive: boolean
      hp: number
      ammo: number
      energy: number
    }>
  } | null
  participants: Array<{
    slot: string
    displayName: string
    sourceHash: string
  }>
}

export type ServerDailyRunMatchesResponse = {
  runId: string
  matches: ServerDailyRunMatch[]
}

export type ServerCreateDailyRunRequest = {
  runDate?: string
  seed?: string | number
  tickCap?: number
  maxRounds?: number
}

function buildApiUrl(baseUrl: string, path: string) {
  // '' is an explicit "same origin" marker (static hosts like GitHub Pages);
  // only null/undefined falls back to the local dev default.
  const normalized = baseUrl === '' ? '' : normalizeServerBaseUrl(baseUrl)
  return `${normalized}${path}`
}

function withQuery(path: string, query?: Record<string, string | undefined>) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') {
      params.set(key, value)
    }
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await fetchImpl(buildApiUrl(baseUrl, path), {
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
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

export async function fetchServerMe(baseUrl: string, fetchImpl?: FetchLike): Promise<ServerMeResponse> {
  return requestJson<ServerMeResponse>(baseUrl, '/api/me', { method: 'GET' }, fetchImpl)
}

export async function registerServerUser(
  baseUrl: string,
  body: { username: string; password: string },
  fetchImpl?: FetchLike,
): Promise<ServerAuthResponse> {
  return requestJson<ServerAuthResponse>(
    baseUrl,
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    fetchImpl,
  )
}

export async function loginServerUser(
  baseUrl: string,
  body: { username: string; password: string },
  fetchImpl?: FetchLike,
): Promise<ServerAuthResponse> {
  return requestJson<ServerAuthResponse>(
    baseUrl,
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    fetchImpl,
  )
}

export async function logoutServerUser(baseUrl: string, fetchImpl?: FetchLike): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    baseUrl,
    '/api/auth/logout',
    {
      method: 'POST',
    },
    fetchImpl,
  )
}

export async function listServerBots(
  baseUrl: string,
  query?: { owner?: string; q?: string },
  fetchImpl?: FetchLike,
): Promise<ServerBotListResponse> {
  return requestJson<ServerBotListResponse>(
    baseUrl,
    withQuery('/api/bots', {
      owner: query?.owner,
      q: query?.q,
    }),
    { method: 'GET' },
    fetchImpl,
  )
}

export async function fetchServerBotSource(
  baseUrl: string,
  owner: string,
  name: string,
  fetchImpl?: FetchLike,
): Promise<ServerBotSourceResponse> {
  return requestJson<ServerBotSourceResponse>(
    baseUrl,
    `/api/bots/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/source`,
    { method: 'GET' },
    fetchImpl,
  )
}

export async function saveServerBot(
  baseUrl: string,
  owner: string,
  name: string,
  body: ServerSaveBotRequest,
  fetchImpl?: FetchLike,
): Promise<ServerBotSummary> {
  return requestJson<ServerBotSummary>(
    baseUrl,
    `/api/bots/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    fetchImpl,
  )
}

export async function listServerDailyRuns(baseUrl: string, fetchImpl?: FetchLike): Promise<ServerDailyRunListResponse> {
  return requestJson<ServerDailyRunListResponse>(baseUrl, '/api/runs', { method: 'GET' }, fetchImpl)
}

export async function fetchLatestServerDailyRun(baseUrl: string, fetchImpl?: FetchLike): Promise<ServerDailyRun> {
  return requestJson<ServerDailyRun>(baseUrl, '/api/runs/latest', { method: 'GET' }, fetchImpl)
}

export async function createServerDailyRun(
  baseUrl: string,
  body: ServerCreateDailyRunRequest,
  fetchImpl?: FetchLike,
): Promise<ServerDailyRun> {
  return requestJson<ServerDailyRun>(
    baseUrl,
    '/api/runs/daily',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    fetchImpl,
  )
}

export type ServerRankedState = {
  rankedActiveLimit: number
  latestRunId: string | null
  latestRunDate: string | null
  bots: Array<ServerBotSummary & Partial<Pick<ServerBotSummary, 'rankedStatus'>>>
}

export async function fetchServerRankedState(
  baseUrl: string,
  fetchImpl?: FetchLike,
): Promise<ServerRankedState> {
  return requestJson<ServerRankedState>(baseUrl, '/api/admin/ranked', { method: 'GET' }, fetchImpl)
}

export async function setServerBotRankedStatus(
  baseUrl: string,
  ownerUsername: string,
  name: string,
  rankedStatus: 'active' | 'pending' | 'dropped',
  fetchImpl?: FetchLike,
): Promise<ServerBotSummary> {
  return requestJson<ServerBotSummary>(
    baseUrl,
    `/api/admin/ranked/${encodeURIComponent(ownerUsername)}/${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ rankedStatus }),
    },
    fetchImpl,
  )
}

export async function fetchServerDailyRunMatches(
  baseUrl: string,
  runId: string,
  fetchImpl?: FetchLike,
): Promise<ServerDailyRunMatchesResponse> {
  return requestJson<ServerDailyRunMatchesResponse>(
    baseUrl,
    `/api/runs/${encodeURIComponent(runId)}/matches`,
    { method: 'GET' },
    fetchImpl,
  )
}
