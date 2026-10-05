#!/usr/bin/env node
// Repeatable admin/dev seed flow: creates demo users on a running server and
// clones the built-in example bots (bot0..bot9) into each account so daily
// ranked leagues have real, user-owned entries to run against.
//
// Usage:
//   node scripts/seed-demo.mjs                       # seeds demo1..demo3 against http://127.0.0.1:3000
//   NOWT_API_URL=http://host:port node scripts/seed-demo.mjs
//   DEMO_PASSWORD=... DEMO_USERS=4 node scripts/seed-demo.mjs

const API_URL = (process.env.NOWT_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo-pass'
const DEMO_USER_COUNT = Number.parseInt(process.env.DEMO_USERS || '3', 10)

async function request(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const res = await fetch(`${API_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const detail = json?.error ?? json ?? text.slice(0, 200)
    throw new Error(`${method} ${pathname} -> ${res.status}: ${JSON.stringify(detail)}`)
  }
  return { json, res }
}

async function registerLogin(username, password) {
  // Prefer login; fall back to register (then log in) for first-time seeding.
  let res = null
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: { username, password } }).catch(
      () => null
    )
    res = login?.res ?? null
  } catch {
    res = null
  }
  if (!res) {
    await request('/api/auth/register', { method: 'POST', body: { username, password } })
    ;({ res } = await request('/api/auth/login', { method: 'POST', body: { username, password } }))
  }
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error(`no session cookie returned for ${username}`)
  return setCookie.split(';')[0]
}

async function main() {
  console.log(`Seeding demo users against ${API_URL}`)

  const { json: botList } = await request('/api/bots?owner=builtin')
  const builtinNames = [...new Set((botList?.bots ?? []).map((b) => b.name))]
  if (builtinNames.length === 0) throw new Error('no builtin example bots found on server')
  console.log(`Found ${builtinNames.length} builtin bots: ${builtinNames.join(', ')}`)

  for (let i = 1; i <= DEMO_USER_COUNT; i++) {
    const username = `demo${i}`
    const cookie = await registerLogin(username, DEMO_PASSWORD)

    let saved = 0
    for (const name of builtinNames) {
      const { json: source } = await request(`/api/bots/builtin/${encodeURIComponent(name)}/source`, { cookie })
      await request(`/api/bots/${username}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        cookie,
        body: {
          sourceText: source.sourceText,
          loadout: source.loadout,
          saveMessage: 'seeded from builtin',
        },
      })
      saved += 1
    }
    console.log(`Seeded @${username} with ${saved} bots (password: ${DEMO_PASSWORD})`)
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
