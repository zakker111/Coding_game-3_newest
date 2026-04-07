import {
  createServerSimulation,
  DEFAULT_SERVER_BASE_URL,
  fetchServerRuleset,
  normalizeServerBaseUrl,
} from './serverSimulation'

describe('serverSimulation helpers', () => {
  it('normalizes the configured server base URL', () => {
    expect(normalizeServerBaseUrl(' http://127.0.0.1:3000/ ')).toBe(DEFAULT_SERVER_BASE_URL)
    expect(normalizeServerBaseUrl('https://example.test///')).toBe('https://example.test')
    expect(normalizeServerBaseUrl('')).toBe(DEFAULT_SERVER_BASE_URL)
  })

  it('fetches ruleset metadata from the configured server base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          rulesetVersion: '0.2.0',
          loadoutSlotCount: 3,
          modules: [],
        }),
        { status: 200 },
      ),
    )

    const result = await fetchServerRuleset('http://127.0.0.1:3000/', fetchMock as any)

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/api/ruleset', expect.any(Object))
    expect(result.rulesetVersion).toBe('0.2.0')
    expect(result.loadoutSlotCount).toBe(3)
  })

  it('surfaces server-side errors as thrown Error messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'INVALID_REQUEST', message: 'participants must contain exactly four slot submissions' },
        }),
        { status: 400 },
      ),
    )

    await expect(
      createServerSimulation(
        'http://127.0.0.1:3000',
        {
          seed: 123,
          tickCap: 20,
          participants: [],
        } as any,
        fetchMock as any,
      ),
    ).rejects.toThrow('participants must contain exactly four slot submissions')
  })
})
