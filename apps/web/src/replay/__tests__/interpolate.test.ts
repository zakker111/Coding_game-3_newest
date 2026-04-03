// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSampleReplay, type ReplayBotState } from '@coding-game/replay'
import { getBotsForPlayback, interpolateBots } from '../interpolate'

describe('interpolateBots', () => {
  it('interpolates positions and snaps non-positional stats', () => {
    const prev: ReplayBotState[] = [
      { botId: 'BOT1', pos: { x: 0, y: 0 }, hp: 100, ammo: 10, energy: 20, alive: true, pc: 1 },
    ]

    const next: ReplayBotState[] = [
      { botId: 'BOT1', pos: { x: 10, y: 20 }, hp: 50, ammo: 9, energy: 19, alive: true, pc: 1 },
    ]

    const mid = interpolateBots(prev, next, 0.5).find((b) => b.botId === 'BOT1')
    expect(mid?.pos.x).toBe(5)
    expect(mid?.pos.y).toBe(10)

    // alpha<1 uses prev stats
    expect(mid?.hp).toBe(100)
    expect(mid?.ammo).toBe(10)

    const end = interpolateBots(prev, next, 1).find((b) => b.botId === 'BOT1')
    expect(end?.hp).toBe(50)
    expect(end?.ammo).toBe(9)
  })
})

describe('getBotsForPlayback (smoke)', () => {
  it('derives render bots from a real replay', () => {
    const replay = generateSampleReplay(12345, { tickCap: 12 })

    const bots = getBotsForPlayback(replay, 5, 0.25)
    expect(bots).toHaveLength(4)
    expect(bots.map((b) => b.botId).sort()).toEqual(['BOT1', 'BOT2', 'BOT3', 'BOT4'])
  })
})
