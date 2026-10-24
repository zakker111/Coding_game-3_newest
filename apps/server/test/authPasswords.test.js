import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../src/app.js'
import { getServerConfig } from '../src/config.js'
import { createInMemoryUserStore } from '../src/store/inMemoryUserStore.js'

async function makeApp(t) {
  const app = await buildApp({ config: getServerConfig({ PORT: '0' }), userStore: createInMemoryUserStore() })
  t.after(() => app.close())
  return app
}

test('register rejects passwords shorter than 8 characters', async (t) => {
  const app = await makeApp(t)
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'shorty', password: 'abcdefg' },
  })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().error.details.minLength, 8)
})

test('register accepts an 8-character password', async (t) => {
  const app = await makeApp(t)
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'eightchr', password: 'abcdefgh' },
  })
  assert.equal(res.statusCode, 201)
})

test('login still accepts the existing 5-character dev admin password', async (t) => {
  // The dev admin is created with the 5-character password "admin". Existing accounts like this
  // must keep logging in after the register minimum went up.
  const app = await makeApp(t)
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin' },
  })
  assert.equal(res.statusCode, 200)
})
