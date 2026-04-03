// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSampleReplay } from '@coding-game/replay'
import { initialPlaybackState, playbackReducer } from '../playbackReducer'

describe('playbackReducer', () => {
  it('loads a replay and clamps ticks', () => {
    const replay = generateSampleReplay(12345, { tickCap: 10 })

    const s0 = playbackReducer(initialPlaybackState, { type: 'LOAD_REPLAY', replay })
    expect(s0.replay?.tickCap).toBe(10)
    expect(s0.tick).toBe(0)
    expect(s0.playing).toBe(false)

    const s1 = playbackReducer(s0, { type: 'SET_TICK', tick: 999 })
    expect(s1.tick).toBe(10)
    expect(s1.playing).toBe(false)

    const s2 = playbackReducer(s1, { type: 'STEP', delta: 1 })
    expect(s2.tick).toBe(10)
    expect(s2.playing).toBe(false)
  })
})
