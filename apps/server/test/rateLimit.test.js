import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../src/app.js'
import { getServerConfig } from '../src/config.js'
import { createInMemoryUserStore } from '../src/store/inMemoryUserStore.js'

function config(env) {
  return getServerConfig({ PORT: '0', ...env })
}

async function makeApp(t, env) {
  const app = await buildApp({ config: config(env), userStore: createInMemoryUserStore() })
  t.after(() => app.close())
  return app
}

function login(app, ip) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'nobody', password: 'wrong-password' },
    remoteAddress: ip,
  })
}

test('login is limited per client and returns 429 with retry-after', async (t) => {
  const app = await makeApp(t, { NOWT_RATE_LIMIT_AUTH_PER_MINUTE: '3', NOWT_TRUST_PROXY: '1' })
  const headers = { 'x-forwarded-for': '203.0.113.5' }
  for (let i = 0; i < 3; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong-password' },
      headers,
    })
    assert.equal(res.statusCode, 401)
  }
  const limited = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'nobody', password: 'wrong-password' },
    headers,
  })
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.json().error.code, 'RATE_LIMITED')
  assert.ok(Number(limited.headers['retry-after']) >= 1)
})

test('one client over the limit does not block another client behind the proxy', async (t) => {
  const app = await makeApp(t, { NOWT_RATE_LIMIT_AUTH_PER_MINUTE: '2', NOWT_TRUST_PROXY: '1' })
  const send = (forwardedFor) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong-password' },
      headers: { 'x-forwarded-for': forwardedFor },
    })
  await send('198.51.100.1')
  await send('198.51.100.1')
  assert.equal((await send('198.51.100.1')).statusCode, 429)
  assert.equal((await send('198.51.100.2')).statusCode, 401)
})

test('without NOWT_TRUST_PROXY the forwarded header is ignored (one shared bucket for the socket address)', async (t) => {
  const app = await makeApp(t, { NOWT_RATE_LIMIT_AUTH_PER_MINUTE: '2' })
  const send = (forwardedFor) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong-password' },
      headers: { 'x-forwarded-for': forwardedFor },
      remoteAddress: '10.0.0.1',
    })
  await send('198.51.100.1')
  await send('198.51.100.2')
  assert.equal((await send('198.51.100.3')).statusCode, 429)
})

test('simulation endpoint has its own limit', async (t) => {
  const app = await makeApp(t, { NOWT_RATE_LIMIT_SIMULATIONS_PER_MINUTE: '2' })
  const send = () => app.inject({ method: 'POST', url: '/api/simulations', payload: {}, remoteAddress: '10.0.0.2' })
  const first = await send()
  assert.notEqual(first.statusCode, 429)
  await send()
  const limited = await send()
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.json().error.code, 'RATE_LIMITED')
})

test('limit of 0 disables the auth limiter', async (t) => {
  const app = await makeApp(t, { NOWT_RATE_LIMIT_AUTH_PER_MINUTE: '0' })
  for (let i = 0; i < 25; i += 1) {
    assert.equal((await login(app, '10.0.0.3')).statusCode, 401)
  }
})
