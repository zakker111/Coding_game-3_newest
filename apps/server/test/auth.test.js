import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestApp } from './_util/testApp.js'

test('register/login/me/logout works with cookie-backed sessions', async (t) => {
  const harness = await createTestApp()
  t.after(async () => {
    await harness.close()
  })

  const registerResponse = await harness.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'Alice',
      password: 'hunter22',
    },
  })

  assert.equal(registerResponse.statusCode, 201)
  const cookie = registerResponse.cookies.find((item) => item.name === 'nowt_session')
  assert.ok(cookie)

  const meResponse = await harness.app.inject({
    method: 'GET',
    url: '/api/me',
    cookies: {
      nowt_session: cookie.value,
    },
  })

  assert.equal(meResponse.statusCode, 200)
  assert.equal(meResponse.json().user.username, 'alice')

  const logoutResponse = await harness.app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    cookies: {
      nowt_session: cookie.value,
    },
  })

  assert.equal(logoutResponse.statusCode, 200)

  const afterLogoutResponse = await harness.app.inject({
    method: 'GET',
    url: '/api/me',
    cookies: {
      nowt_session: cookie.value,
    },
  })

  assert.equal(afterLogoutResponse.statusCode, 200)
  assert.equal(afterLogoutResponse.json().user, null)
})
