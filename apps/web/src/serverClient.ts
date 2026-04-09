import { normalizeServerBaseUrl } from './serverSimulation'

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
}

export type ServerBotListResponse = {
  bots: ServerBotSummary[]
}

export type ServerBotSourceResponse = {
  botId: string
  sourceText: string
}

export type ServerSaveBotRequest = {
  sourceText: string
  saveMessage?: string
}

function buildApiUrl(baseUrl: string, path: string) {
  return `${normalizeServerBaseUrl(baseUrl)}${path}`
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
