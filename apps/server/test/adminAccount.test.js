import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../src/app.js'
import { getServerConfig } from '../src/config.js'
import { createInMemoryUserStore } from '../src/store/inMemoryUserStore.js'

const PROD_PASSWORD = 'a-long-admin-pass-1'

function config(env) {
  return getServerConfig({ PORT: '0', ...env })
}

async function login(app, username, password) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } })
}

test('production without NOWT_ADMIN_PASSWORD creates no admin account', async (t) => {
  const app = await buildApp({ config: config({ NODE_ENV: 'production' }), userStore: createInMemoryUserStore() })
  t.after(() => app.close())
  assert.equal((await login(app, 'admin', 'admin')).statusCode, 401)
  assert.equal((await login(app, 'admin', PROD_PASSWORD)).statusCode, 401)
})

test('production admin uses NOWT_ADMIN_PASSWORD and rejects admin/admin', async (t) => {
  const app = await buildApp({
    config: config({ NODE_ENV: 'production', NOWT_ADMIN_PASSWORD: PROD_PASSWORD }),
    userStore: createInMemoryUserStore(),
  })
  t.after(() => app.close())
  assert.equal((await login(app, 'admin', PROD_PASSWORD)).statusCode, 200)
  assert.equal((await login(app, 'admin', 'admin')).statusCode, 401)
})

test('production rotates an old admin/admin password to the configured one on start', async (t) => {
  const userStore = createInMemoryUserStore()
  const dev = await buildApp({ config: config({}), userStore })
  t.after(() => dev.close())
  assert.equal((await login(dev, 'admin', 'admin')).statusCode, 200)

  const prod = await buildApp({
    config: config({ NODE_ENV: 'production', NOWT_ADMIN_PASSWORD: PROD_PASSWORD }),
    userStore,
  })
  t.after(() => prod.close())
  assert.equal((await login(prod, 'admin', 'admin')).statusCode, 401)
  assert.equal((await login(prod, 'admin', PROD_PASSWORD)).statusCode, 200)
})

test('production refuses a short or default admin password', async () => {
  await assert.rejects(
    buildApp({
      config: config({ NODE_ENV: 'production', NOWT_ADMIN_PASSWORD: 'short' }),
      userStore: createInMemoryUserStore(),
    }),
    /at least 12 characters/
  )
  await assert.rejects(
    buildApp({
      config: config({ NODE_ENV: 'production', NOWT_ADMIN_PASSWORD: 'admin' }),
      userStore: createInMemoryUserStore(),
    }),
    /at least 12 characters|default password/
  )
})

test('development still creates admin/admin for local play and tests', async (t) => {
  const app = await buildApp({ config: config({}), userStore: createInMemoryUserStore() })
  t.after(() => app.close())
  assert.equal((await login(app, 'admin', 'admin')).statusCode, 200)
})
