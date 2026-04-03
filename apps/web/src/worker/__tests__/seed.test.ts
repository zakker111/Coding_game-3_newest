// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { BotSpec } from '../messages'
import { mixSeed } from '../seed'

describe('mixSeed', () => {
  it('is deterministic and sensitive to bot source changes', () => {
    const bots: BotSpec[] = [
      { slotId: 'BOT1', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1', loadout: ['BULLET', null, null] },
    ]

    const a = mixSeed(12345, [...bots])
    const b = mixSeed(12345, [...bots])
    expect(a).toBe(b)

    const c = mixSeed(12345, [...bots.slice(0, 3), { slotId: 'BOT4', sourceText: 'WAIT 2', loadout: ['BULLET', null, null] }])
    expect(c).not.toBe(a)

    const d = mixSeed(12345, [...bots.slice(0, 3), { slotId: 'BOT4', sourceText: 'WAIT 1', loadout: ['SAW', null, null] }])
    expect(d).not.toBe(a)
  })
})
