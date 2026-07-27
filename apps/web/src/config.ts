import { DEFAULT_SERVER_BASE_URL } from './serverSimulation'

export function getDefaultServerBaseUrl() {
  if (typeof window === 'undefined') return DEFAULT_SERVER_BASE_URL
  const { protocol, hostname } = window.location
  const proxyMatch = /^(\d+)-(.+\.(?:cosine\.computer|replit\.dev))$/.exec(hostname)
  if (proxyMatch) {
    return `${protocol}//3000-${proxyMatch[2]}`
  }
  return DEFAULT_SERVER_BASE_URL
}
