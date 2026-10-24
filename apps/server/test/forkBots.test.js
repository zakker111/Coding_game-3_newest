import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'

async function registerUser(app, username, password = 'password123') {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } })
  assert.equal(response.statusCode, 201, response.body)
  return response.headers['set-cookie']
}

async function setup(t) {
  const app = await buildApp()
  t.after(async () => {
    await app.close()
  })
  return app
}

test('fork copies a builtin bot, records forkedFrom, starts pending, and flips active after a real change', async (t) => {
  const app = await setup(t)
  const alice = await registerUser(app, 'alice')

  const builtin = await app.inject({ method: 'GET', url: '/api/bots/builtin/bot11' })
  assert.equal(builtin.statusCode, 200)
  const builtinSource = await app.inject({ method: 'GET', url: '/api/bots/builtin/bot11/source' })
  const sourceText = builtinSource.json().sourceText

  // Alice starts with three starter bots, so forking needs overwrite on one of them.
  const blocked = await app.inject({
    method: 'POST',
    url: '/api/bots/builtin/bot11/fork',
    headers: { cookie: alice },
    payload: { name: 'bot1' },
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(blocked.json().error.code, 'BOT_EXISTS')

  const forked = await app.inject({
    method: 'POST',
    url: '/api/bots/builtin/bot11/fork',
    headers: { cookie: alice },
    payload: { name: 'bot1', overwrite: true },
  })
  assert.equal(forked.statusCode, 201, forked.body)
  const fork = forked.json()
  assert.equal(fork.botId, 'alice/bot1')
  assert.equal(fork.forkedFrom, 'builtin/bot11')
  assert.equal(fork.rankedStatus, 'pending')
  assert.equal(fork.visibility, 'public')
  assert.equal(fork.rating, 1500)
  assert.equal(fork.rankedPoints, 0)

  const copied = await app.inject({ method: 'GET', url: '/api/bots/alice/bot1/source', headers: { cookie: alice } })
  assert.equal(copied.json().sourceText, sourceText)

  // Saving the same source and loadout keeps the fork pending.
  const unchanged = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: { cookie: alice },
    payload: { sourceText, loadout: builtinSource.json().loadout, saveMessage: 'no change' },
  })
  assert.equal(unchanged.statusCode, 200, unchanged.body)
  assert.equal(unchanged.json().rankedStatus, 'pending')
  assert.equal(unchanged.json().forkedFrom, 'builtin/bot11')

  // Changing one line makes it active.
  const changed = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: { cookie: alice },
    payload: { sourceText: `${sourceText}WAIT 2\n`, loadout: builtinSource.json().loadout, saveMessage: 'edit' },
  })
  assert.equal(changed.statusCode, 200, changed.body)
  assert.equal(changed.json().rankedStatus, 'active')
  assert.equal(changed.json().forkedFrom, 'builtin/bot11')
})

test('fork refuses unauthenticated users, private sources, and a fourth bot', async (t) => {
  const app = await setup(t)
  const alice = await registerUser(app, 'alice')
  const bob = await registerUser(app, 'bob')

  const anonymous = await app.inject({ method: 'POST', url: '/api/bots/builtin/bot11/fork', payload: { name: 'copy' } })
  assert.equal(anonymous.statusCode, 401)

  // Alice makes bot2 private. Bob can neither see it nor fork it.
  const priv = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot2',
    headers: { cookie: alice },
    payload: { sourceText: 'WAIT 1\n', loadout: [null, null, null], visibility: 'private' },
  })
  assert.equal(priv.statusCode, 200, priv.body)
  assert.equal(priv.json().visibility, 'private')

  const hiddenGet = await app.inject({ method: 'GET', url: '/api/bots/alice/bot2', headers: { cookie: bob } })
  assert.equal(hiddenGet.statusCode, 404)
  const hiddenSource = await app.inject({ method: 'GET', url: '/api/bots/alice/bot2/source', headers: { cookie: bob } })
  assert.equal(hiddenSource.statusCode, 404)
  const bobList = await app.inject({ method: 'GET', url: '/api/bots?owner=alice', headers: { cookie: bob } })
  assert.equal(bobList.json().bots.length, 2)

  const ownerView = await app.inject({ method: 'GET', url: '/api/bots/alice/bot2', headers: { cookie: alice } })
  assert.equal(ownerView.statusCode, 200)

  const forbidden = await app.inject({
    method: 'POST',
    url: '/api/bots/alice/bot2/fork',
    headers: { cookie: bob },
    payload: { name: 'bot1' },
  })
  assert.equal(forbidden.statusCode, 404)
  assert.equal(forbidden.json().error.code, 'BOT_NOT_FOUND')

  // Bob has no bots yet? He has three starters, so a new name hits the limit.
  const limit = await app.inject({
    method: 'POST',
    url: '/api/bots/builtin/bot11/fork',
    headers: { cookie: bob },
    payload: { name: 'fresh' },
  })
  assert.equal(limit.statusCode, 409)
  assert.equal(limit.json().error.code, 'MAX_BOTS_REACHED')

  const badVisibility = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: { cookie: alice },
    payload: { sourceText: 'WAIT 1\n', loadout: [null, null, null], visibility: 'secret' },
  })
  assert.equal(badVisibility.statusCode, 400)
})

test('a public player bot can be forked and keeps its owner in forkedFrom', async (t) => {
  const app = await setup(t)
  const alice = await registerUser(app, 'alice')
  const bob = await registerUser(app, 'bob')

  const aliceBot = await app.inject({
    method: 'PUT',
    url: '/api/bots/alice/bot1',
    headers: { cookie: alice },
    payload: { sourceText: 'WAIT 3\n', loadout: ['BULLET', null, null] },
  })
  assert.equal(aliceBot.statusCode, 200)

  const forked = await app.inject({
    method: 'POST',
    url: '/api/bots/alice/bot1/fork',
    headers: { cookie: bob },
    payload: { name: 'bot3', overwrite: true },
  })
  assert.equal(forked.statusCode, 201, forked.body)
  assert.equal(forked.json().forkedFrom, 'alice/bot1')
  assert.equal(forked.json().rankedStatus, 'pending')
})
