import {
  createServerSimulation,
  DEFAULT_SERVER_BASE_URL,
  fetchServerRuleset,
  getLocalMirroredRuleset,
  normalizeServerBaseUrl,
  runLocalMirroredServerSimulation,
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

  it('returns the shared ruleset for local mirror mode', () => {
    const ruleset = getLocalMirroredRuleset()
    expect(ruleset.rulesetVersion).toBe('0.2.0')
    expect(ruleset.loadoutSlotCount).toBe(3)
    expect(ruleset.modules.some((module) => module.id === 'BULLET')).toBe(true)
  })

  it('mirrors the server simulation flow locally without HTTP', async () => {
    const result = await runLocalMirroredServerSimulation(
      {
        seed: 123,
        tickCap: 12,
        participants: [
          { slot: 'BOT1', displayName: 'Alpha', sourceText: 'WAIT 1\r\n', loadout: ['BULLET', null, null] },
          { slot: 'BOT2', displayName: 'Beta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
          { slot: 'BOT3', displayName: 'Gamma', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
          { slot: 'BOT4', displayName: 'Delta', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
        ],
      },
      {
        now: () => '2026-04-07T00:00:00.000Z',
        hashText: async () => 'hash123',
        runReplay: vi.fn().mockResolvedValue({
          schemaVersion: '0.2.0',
          rulesetVersion: '0.2.0',
          ticksPerSecond: 1,
          matchSeed: 123,
          tickCap: 12,
          bots: [
            { botId: 'BOT1', slotId: 'BOT1', displayName: 'Alpha', sourceText: 'WAIT 1\n', loadout: ['BULLET', null, null], loadoutIssues: [] },
            { botId: 'BOT2', slotId: 'BOT2', displayName: 'Beta', sourceText: 'WAIT 1\n', loadout: [null, null, null], loadoutIssues: [] },
            { botId: 'BOT3', slotId: 'BOT3', displayName: 'Gamma', sourceText: 'WAIT 1\n', loadout: [null, null, null], loadoutIssues: [] },
            { botId: 'BOT4', slotId: 'BOT4', displayName: 'Delta', sourceText: 'WAIT 1\n', loadout: [null, null, null], loadoutIssues: [] },
          ],
          state: Array.from({ length: 13 }, (_, tick) => ({
            tick,
            bots: [
              { botId: 'BOT1', hp: 100, ammo: 100, energy: 100, alive: true },
              { botId: 'BOT2', hp: 100, ammo: 100, energy: 100, alive: true },
              { botId: 'BOT3', hp: 100, ammo: 100, energy: 100, alive: true },
              { botId: 'BOT4', hp: 100, ammo: 100, energy: 100, alive: true },
            ],
            bullets: [],
            powerups: [],
            drones: [],
            grenades: [],
            mines: [],
          })),
          events: Array.from({ length: 13 }, (_, tick) =>
            tick === 12 ? [{ type: 'MATCH_END', endReason: 'TICK_CAP' }] : []
          ),
        } as any),
      },
    )

    expect(result.created.status).toBe('complete')
    expect(result.match.participants[0].sourceTextSnapshot).toBe('WAIT 1\n')
    expect(result.match.participants[0].sourceHash).toBe('hash123')
    expect(result.match.result?.endReason).toBe('TICK_CAP')
    expect(result.replay.tickCap).toBe(12)
  })
})
