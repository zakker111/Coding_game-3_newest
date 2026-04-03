let enginePromise = null

function loadEngine() {
  if (!enginePromise) {
    enginePromise = import(new URL('../engine/src/index.js', import.meta.url))
  }
  return enginePromise
}

self.addEventListener('message', async (event) => {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return

  // Accept both:
  // - { requestId, seed, tickCap, bots }
  // - { type: 'RUN_MATCH', requestId, seed, tickCap, bots } (legacy internal)
  if (msg.type && msg.type !== 'RUN_MATCH') return

  const { requestId, seed, tickCap, bots } = msg
  if (requestId == null) return

  try {
    const { runMatchToReplay } = await loadEngine()
    const replay = runMatchToReplay({ seed, tickCap, bots })

    self.postMessage({
      type: 'RUN_RESULT',
      requestId,
      ok: true,
      replay,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    self.postMessage({
      type: 'RUN_RESULT',
      requestId,
      ok: false,
      error: { message, stack },
    })
  }
})
