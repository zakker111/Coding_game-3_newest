import { isRunLocalMessage } from './messages'
import { runMatchLocal } from './runMatchLocal'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isRunLocalMessage(event.data)) return

  const { requestId, seed, tickCap, bots } = event.data

  const replay = runMatchLocal(
    seed,
    tickCap,
    bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
  )

  self.postMessage({
    type: 'RUN_RESULT',
    requestId,
    replay,
  })
})
