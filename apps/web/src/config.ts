import { DEFAULT_SERVER_BASE_URL } from './serverSimulation'

export function getDefaultServerBaseUrl() {
  if (typeof window === 'undefined') return DEFAULT_SERVER_BASE_URL
  const { protocol, hostname } = window.location
  // GitHub Pages (and any static host without an /api proxy): the game runs fully
  // client-side; remote server features are unavailable on these hosts.
  if (/\.github\.io$/.test(hostname)) return ''
  const cosineMatch = /^(\d+)-(.+\.cosine\.computer)$/.exec(hostname)
  if (cosineMatch) {
    return `${protocol}//3000-${cosineMatch[2]}`
  }
  // Cloudflare quick-tunnel preview: <prefix>-4173.trycloudflare.com -> <prefix>-3000.trycloudflare.com
  const tunnelMatch = /^(.*)-4173\.trycloudflare\.com$/.exec(hostname)
  if (tunnelMatch) {
    return `${protocol}//${tunnelMatch[1]}-3000.trycloudflare.com`
  }
  // When served through the static server's /api proxy (e.g. remote preview), use same origin.
  try {
    const override = localStorage.getItem('nowt.serverBaseUrl')
    if (override === 'same-origin' || override === hostname) return `${protocol}//${hostname}`
  } catch {
    /* ignore */
  }
  return DEFAULT_SERVER_BASE_URL
}

// Remote preview fallback: if this origin exposes a working /api proxy, use it
// and persist the choice so synchronous readers pick it up too.
export async function resolveDefaultServerBaseUrl(): Promise<string> {
  const sync = getDefaultServerBaseUrl()
  if (typeof window === 'undefined') return sync
  const { protocol, hostname } = window.location
  // GitHub Pages has no /api proxy; never probe or fall back to a local server URL.
  if (/\.github\.io$/.test(hostname)) return ''
  if (hostname === 'localhost' || hostname.startsWith('127.')) return sync
  if (sync !== DEFAULT_SERVER_BASE_URL) return sync
  try {
    const probe = await fetch('/api/ruleset', { method: 'GET' })
    if (probe.ok) {
      const sameOrigin = `${protocol}//${hostname}`
      try {
        localStorage.setItem('nowt.serverBaseUrl', sameOrigin)
      } catch {
        /* ignore */
      }
      return sameOrigin
    }
  } catch {
    /* ignore */
  }
  return sync
}
