import { runMatchToReplay } from '@coding-game/engine'

import { isRunLocalMessage, isRunServerMirrorMessage } from './messages'
import { runMatchLocal } from './runMatchLocal'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isRunLocalMessage(event.data)) {
    const { requestId, seed, tickCap, bots } = event.data

    const replay = runMatchLocal(
      seed,
      tickCap,
      bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
      event.data.inactiveSlots ?? [],
    )

    self.postMessage({
      type: 'RUN_RESULT',
      requestId,
      replay,
    })
    return
  }

  if (isRunServerMirrorMessage(event.data)) {
    const { requestId, seed, tickCap, bots } = event.data

    const replay = runMatchToReplay({
      seed,
      tickCap,
      bots: bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
    })

    self.postMessage({
      type: 'RUN_SERVER_MIRROR_RESULT',
      requestId,
      replay,
    })
  }
})
