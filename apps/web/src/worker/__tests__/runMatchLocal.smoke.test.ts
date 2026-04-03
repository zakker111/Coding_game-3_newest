// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EXAMPLE_BOTS } from '../../exampleBots'
import { deriveLoadoutForSlot } from '../../loadout'
import { runMatchLocal } from '../runMatchLocal'

describe('runMatchLocal (smoke)', () => {
  it('runs a real example match end-to-end with non-empty loadouts', () => {
    const bots = [
      { slotId: 'BOT1' as const, sourceText: EXAMPLE_BOTS.bot0.sourceText, loadout: deriveLoadoutForSlot('BOT1', EXAMPLE_BOTS.bot0.sourceText) },
      { slotId: 'BOT2' as const, sourceText: EXAMPLE_BOTS.bot2.sourceText, loadout: deriveLoadoutForSlot('BOT2', EXAMPLE_BOTS.bot2.sourceText) },
      { slotId: 'BOT3' as const, sourceText: EXAMPLE_BOTS.bot3.sourceText, loadout: deriveLoadoutForSlot('BOT3', EXAMPLE_BOTS.bot3.sourceText) },
      { slotId: 'BOT4' as const, sourceText: EXAMPLE_BOTS.bot4.sourceText, loadout: deriveLoadoutForSlot('BOT4', EXAMPLE_BOTS.bot4.sourceText) },
    ]

    const replay = runMatchLocal(12345, 50, bots)

    expect(replay.rulesetVersion).toBe('0.2.0')
    expect(replay.bots).toHaveLength(4)

    // With BULLET-equipped bots, we should see bullet spawns.
    const anyBulletSpawn = replay.events.flat().some((e) => e.type === 'BULLET_SPAWN')
    expect(anyBulletSpawn).toBe(true)
  })

  it('does not spawn bullets when all loadouts are empty', () => {
    const emptyLoadout: [null, null, null] = [null, null, null]

    const bots = [
      { slotId: 'BOT1' as const, sourceText: EXAMPLE_BOTS.bot0.sourceText, loadout: emptyLoadout },
      { slotId: 'BOT2' as const, sourceText: EXAMPLE_BOTS.bot2.sourceText, loadout: emptyLoadout },
      { slotId: 'BOT3' as const, sourceText: EXAMPLE_BOTS.bot3.sourceText, loadout: emptyLoadout },
      { slotId: 'BOT4' as const, sourceText: EXAMPLE_BOTS.bot4.sourceText, loadout: emptyLoadout },
    ]

    const replay = runMatchLocal(12345, 50, bots)

    expect(replay.rulesetVersion).toBe('0.2.0')

    const anyBulletSpawn = replay.events.flat().some((e) => e.type === 'BULLET_SPAWN')
    expect(anyBulletSpawn).toBe(false)
  })
})
