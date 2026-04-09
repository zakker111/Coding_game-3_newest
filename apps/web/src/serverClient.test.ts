import {
  fetchServerBotSource,
  fetchServerMe,
  listServerBots,
  loginServerUser,
  logoutServerUser,
  registerServerUser,
  saveServerBot,
} from './serverClient'

describe('serverClient helpers', () => {
  it('fetches the current authenticated user with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u_1', username: 'alice', createdAt: '2026-04-07T00:00:00.000Z' } }), {
        status: 200,
      }),
    )

    const result = await fetchServerMe('http://127.0.0.1:3000/', fetchMock as any)

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/api/me', expect.objectContaining({ credentials: 'include' }))
    expect(result.user?.username).toBe('alice')
  })

  it('registers, logs in, and logs out against the auth routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { id: 'u_1', username: 'alice', createdAt: '2026-04-07T00:00:00.000Z' } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { id: 'u_1', username: 'alice', createdAt: '2026-04-07T00:00:00.000Z' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const registered = await registerServerUser('http://127.0.0.1:3000', { username: 'alice', password: 'password123' }, fetchMock as any)
    const loggedIn = await loginServerUser('http://127.0.0.1:3000', { username: 'alice', password: 'password123' }, fetchMock as any)
    const loggedOut = await logoutServerUser('http://127.0.0.1:3000', fetchMock as any)

    expect(registered.user.username).toBe('alice')
    expect(loggedIn.user.username).toBe('alice')
    expect(loggedOut.ok).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3000/api/auth/register',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3000/api/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:3000/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('lists bots and fetches a saved bot source for the authenticated owner', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bots: [{ botId: 'alice/bot1', ownerUsername: 'alice', name: 'bot1', updatedAt: null, sourceHash: 'hash1' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ botId: 'alice/bot1', sourceText: 'WAIT 1\n' }), { status: 200 }),
      )

    const listed = await listServerBots('http://127.0.0.1:3000', { owner: 'alice' }, fetchMock as any)
    const source = await fetchServerBotSource('http://127.0.0.1:3000', 'alice', 'bot1', fetchMock as any)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3000/api/bots?owner=alice',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3000/api/bots/alice/bot1/source',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    expect(listed.bots[0].botId).toBe('alice/bot1')
    expect(source.sourceText).toBe('WAIT 1\n')
  })

  it('saves a bot source and surfaces server-side errors', async () => {
    const successFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          botId: 'alice/bot1',
          ownerUsername: 'alice',
          name: 'bot1',
          updatedAt: '2026-04-07T00:00:00.000Z',
          sourceHash: 'hash1',
        }),
        { status: 200 },
      ),
    )

    const saved = await saveServerBot(
      'http://127.0.0.1:3000',
      'alice',
      'bot1',
      { sourceText: 'WAIT 1\n', saveMessage: 'sync' },
      successFetch as any,
    )

    expect(saved.sourceHash).toBe('hash1')
    expect(successFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/bots/alice/bot1',
      expect.objectContaining({ method: 'PUT', credentials: 'include' }),
    )

    const failingFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'authentication is required' } }), { status: 401 }),
    )

    await expect(
      saveServerBot('http://127.0.0.1:3000', 'alice', 'bot1', { sourceText: 'WAIT 1\n' }, failingFetch as any),
    ).rejects.toThrow('authentication is required')
  })
})
