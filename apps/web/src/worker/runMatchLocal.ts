import type { Replay } from '@coding-game/replay'
import { runMatchToReplay } from '@coding-game/engine'

import type { BotSpec } from './messages'

export function runMatchLocal(seed: number, tickCap: number, bots: BotSpec[], inactiveSlots: BotSpec['slotId'][] = []): Replay {
  // Parity rule: the client sim must feed the engine the RAW user seed, exactly like
  // deploy/workshop -> deploy/engine. Replaying with the same seed + same bot sources
  // must always produce the identical replay (qa-workshop.mjs step 7 baseline parity).
  // (Historical note: we used to hash sources into the seed via mixSeed(), which made
  // replays non-reproducible and broke parity with the deploy surface.)
  return runMatchToReplay({
    seed,
    tickCap,
    bots: bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
    inactiveSlots,
  })
}
