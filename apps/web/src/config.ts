import { DEFAULT_SERVER_BASE_URL } from './serverSimulation'

export function getDefaultServerBaseUrl() {
  if (typeof window === 'undefined') return DEFAULT_SERVER_BASE_URL
  const { protocol, hostname } = window.location
  const cosineMatch = /^(\d+)-(.+\.cosine\.computer)$/.exec(hostname)
  if (cosineMatch) {
    return `${protocol}//3000-${cosineMatch[2]}`
  }
  return DEFAULT_SERVER_BASE_URL
}
