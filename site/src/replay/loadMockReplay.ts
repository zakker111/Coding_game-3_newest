import type { Replay } from './replayTypes'

export async function loadMockReplay(): Promise<Replay> {
  // Use an absolute URL so this also works in Vitest (Node's fetch rejects relative URLs).
  const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
  const url = new URL('/replays/mock-replay.json', base)

  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Failed to load mock replay: ${res.status} ${res.statusText}`)
  }

  return (await res.json()) as Replay
}
