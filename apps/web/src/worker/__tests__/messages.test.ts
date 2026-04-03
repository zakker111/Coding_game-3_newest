// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSampleReplay } from '@coding-game/replay'
import { isRunLocalMessage, isRunResultMessage } from '../messages'

describe('worker message guards', () => {
  it('accepts valid RUN_LOCAL', () => {
    expect(
      isRunLocalMessage({
        type: 'RUN_LOCAL',
        requestId: 1,
        seed: 123,
        tickCap: 50,
        bots: [
          { slotId: 'BOT1', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
          { slotId: 'BOT2', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
          { slotId: 'BOT3', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
          { slotId: 'BOT4', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
        ],
      }),
    ).toBe(true)

    expect(isRunLocalMessage({ type: 'RUN_LOCAL' })).toBe(false)
  })

  it('accepts valid RUN_RESULT', () => {
    const replay = generateSampleReplay(12345, { tickCap: 3 })

    expect(
      isRunResultMessage({
        type: 'RUN_RESULT',
        requestId: 1,
        replay,
      }),
    ).toBe(true)

    expect(isRunResultMessage({ type: 'RUN_RESULT', requestId: 1, replay: {} })).toBe(false)
  })
})
