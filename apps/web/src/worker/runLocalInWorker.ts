import type { Loadout, Replay, SlotId } from '@coding-game/replay'
import type { BotSpec, RunLocalMessage, RunServerMirrorMessage } from './messages'
import { isRunResultMessage, isRunServerMirrorResultMessage } from './messages'

export type RunLocalParams = {
  seed: number
  tickCap: number
  bots: Array<{ slotId: SlotId; sourceText: string; loadout: Loadout }>
  inactiveSlots?: SlotId[]
}

export type RunServerMirrorParams = {
  seed: number | string
  tickCap: number
  bots: Array<{ slotId: SlotId; sourceText: string; loadout: Loadout }>
}

let nextRequestId = 1

function createWorker(): Worker {
  return new Worker(new URL('./simRunner.worker.ts', import.meta.url), {
    type: 'module',
  })
}

export async function runLocalInWorker(params: RunLocalParams): Promise<Replay> {
  const worker = createWorker()
  const requestId = nextRequestId++

  const msg: RunLocalMessage = {
    type: 'RUN_LOCAL',
    requestId,
    seed: params.seed,
    tickCap: params.tickCap,
    bots: params.bots,
    inactiveSlots: params.inactiveSlots,
  }

  return await new Promise<Replay>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Worker timed out'))
    }, 10_000)

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isRunResultMessage(event.data)) return
      if (event.data.requestId !== requestId) return

      window.clearTimeout(timeout)
      worker.terminate()
      resolve(event.data.replay)
    })

    worker.addEventListener('error', (err) => {
      window.clearTimeout(timeout)
      worker.terminate()
      reject(err)
    })

    worker.postMessage(msg)
  })
}

export async function runServerMirrorInWorker(params: RunServerMirrorParams): Promise<Replay> {
  const worker = createWorker()
  const requestId = nextRequestId++

  const msg: RunServerMirrorMessage = {
    type: 'RUN_SERVER_MIRROR',
    requestId,
    seed: params.seed,
    tickCap: params.tickCap,
    bots: params.bots as BotSpec[],
  }

  return await new Promise<Replay>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Worker timed out'))
    }, 10_000)

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isRunServerMirrorResultMessage(event.data)) return
      if (event.data.requestId !== requestId) return

      window.clearTimeout(timeout)
      worker.terminate()
      resolve(event.data.replay)
    })

    worker.addEventListener('error', (err) => {
      window.clearTimeout(timeout)
      worker.terminate()
      reject(err)
    })

    worker.postMessage(msg)
  })
}
