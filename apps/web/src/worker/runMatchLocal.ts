import type { Replay } from '@coding-game/replay'
import { runMatchToReplay } from '@coding-game/engine'

import type { BotSpec } from './messages'
import { mixSeed } from './seed'

export function runMatchLocal(seed: number, tickCap: number, bots: BotSpec[], inactiveSlots: BotSpec['slotId'][] = []): Replay {
  const mixedSeed = mixSeed(seed, bots)

  return runMatchToReplay({
    seed: mixedSeed,
    tickCap,
    bots: bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
    inactiveSlots,
  })
}
