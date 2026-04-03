import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { loadMockReplay } from '../replay/loadMockReplay'
import type { Replay, SlotId } from '../replay/replayTypes'
import { ArenaCanvas } from '../ui/arena/ArenaCanvas'

const SPEED_STORAGE_KEY = 'nowt.workshop.speed'
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const

type Speed = (typeof SPEED_OPTIONS)[number]

type Playhead = {
  /**
   * `ArenaCanvas` interprets `tick` as the "end-of-tick" snapshot index.
   * During playback we render tick `t` with `p∈[0,1]` interpolating from state[t-1] → state[t].
   */
  tick: number
  /** Intra-tick progress in [0,1]. */
  p: number
}

type BotName = 'me/bot1' | 'me/bot2' | 'me/bot3'

type LoadoutSlot = '' | 'BULLET' | 'SAW' | 'SHIELD' | 'ARMOR'

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function readSpeedFromStorage(): Speed {
  try {
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY)
    const v = raw ? Number(raw) : NaN
    if (SPEED_OPTIONS.includes(v as Speed)) return v as Speed
  } catch {
    // ignore
  }
  return 1
}

function writeSpeedToStorage(speed: Speed) {
  try {
    window.localStorage.setItem(SPEED_STORAGE_KEY, String(speed))
  } catch {
    // ignore
  }
}

function readTickFromSearch(search: string) {
  const sp = new URLSearchParams(search)
  const raw = sp.get('tick')
  const v = raw ? Number(raw) : NaN
  return Number.isFinite(v) ? Math.floor(v) : null
}

function replaceTickInSearch(search: string, tick: number) {
  const sp = new URLSearchParams(search)
  sp.set('tick', String(tick))
  const next = sp.toString()
  return next ? `?${next}` : ''
}

export function WorkshopPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [replay, setReplay] = React.useState<Replay | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [myBot, setMyBot] = React.useState<BotName>('me/bot1')
  const [editorText, setEditorText] = React.useState('LABEL LOOP\nTARGET_CLOSEST\nMOVE_DIR\nGOTO LOOP\n')

  const [inspectBot, setInspectBot] = React.useState<SlotId>('BOT1')

  const [slot1, setSlot1] = React.useState<LoadoutSlot>('BULLET')
  const [slot2, setSlot2] = React.useState<LoadoutSlot>('')
  const [slot3, setSlot3] = React.useState<LoadoutSlot>('')

  const [speed, setSpeed] = React.useState<Speed>(() => {
    if (typeof window === 'undefined') return 1
    return readSpeedFromStorage()
  })

  const [playing, setPlaying] = React.useState(false)

  // When paused/scrubbing/stepping, we keep p=1 (exact tick snapshot).
  const [head, setHead] = React.useState<Playhead>({ tick: 0, p: 1 })

  React.useEffect(() => {
    let cancelled = false

    loadMockReplay()
      .then((r) => {
        if (cancelled) return
        setReplay(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const maxTick = replay ? Math.max(0, replay.state.length - 1) : 0
  const tickCap = replay?.tickCap ?? maxTick

  // Initialize tick from URL (only after replay loads so we can clamp).
  React.useEffect(() => {
    if (!replay) return

    const fromUrl = readTickFromSearch(location.search)
    if (fromUrl === null) return

    setHead((h) => {
      const nextTick = clampInt(fromUrl, 0, maxTick)
      if (h.tick === nextTick && h.p === 1) return h
      return { tick: nextTick, p: 1 }
    })
  }, [location.search, maxTick, replay])

  // Keep URL query param in sync.
  React.useEffect(() => {
    if (!replay) return

    const cur = readTickFromSearch(location.search)
    if (cur === head.tick) return

    navigate({ pathname: location.pathname, search: replaceTickInSearch(location.search, head.tick) }, { replace: true })
  }, [head.tick, location.pathname, location.search, navigate, replay])

  React.useEffect(() => {
    writeSpeedToStorage(speed)
  }, [speed])

  // Playback loop.
  React.useEffect(() => {
    if (!replay) return
    if (!playing) return

    const tps = replay.ticksPerSecond || 1

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000)
      last = now

      const dp = dt * tps * speed

      setHead((h) => {
        let tick = h.tick
        let p = h.p + dp

        while (p >= 1 && tick < maxTick) {
          p -= 1
          tick += 1
        }

        return { tick, p: clamp(p, 0, 1) }
      })

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [maxTick, playing, replay, speed])

  // Auto-stop at the end.
  React.useEffect(() => {
    if (!playing) return
    if (!replay) return

    if (head.tick >= maxTick && head.p >= 1) {
      setPlaying(false)
      setHead((h) => ({ tick: h.tick, p: 1 }))
    }
  }, [head.p, head.tick, maxTick, playing, replay])

  const tickLabel = replay ? `Tick ${head.tick} / ${tickCap}` : 'Loading replay…'
  const wsStatus = playing ? 'Playing' : 'Idle'

  const onPlayPause = () => {
    if (!replay) return

    setPlaying((v) => {
      const next = !v

      // If we are starting playback, shift to the next tick with p=0 to animate state[t] -> state[t+1].
      if (next) {
        setHead((h) => {
          if (h.tick >= maxTick) return { tick: maxTick, p: 1 }

          const nextTick = clampInt(h.tick + 1, 0, maxTick)
          // tick=0 has no prior tick; ArenaCanvas forces p=1 anyway.
          return nextTick === 0 ? { tick: 0, p: 1 } : { tick: nextTick, p: 0 }
        })
      } else {
        // Pausing snaps to exact tick.
        setHead((h) => ({ tick: h.tick, p: 1 }))
      }

      return next
    })
  }

  const onSeekTick = (t: number) => {
    if (!replay) return
    setPlaying(false)
    setHead({ tick: clampInt(t, 0, maxTick), p: 1 })
  }

  const stepBy = (delta: number) => {
    if (!replay) return
    setPlaying(false)
    setHead((h) => ({ tick: clampInt(h.tick + delta, 0, maxTick), p: 1 }))
  }

  const restart = () => {
    if (!replay) return
    setPlaying(false)
    setHead({ tick: 0, p: 1 })
  }

  return (
    <div className="page workshop">
      <header className="ws-header">
        <div className="ws-brand">
          <h1 className="ws-brand-title">Workshop</h1>
          <div className="ws-brand-subtitle">Edit BOT1 → Run / Preview → Replay</div>
        </div>

        <div className="ws-header-controls" aria-label="Workshop header controls">
          <div>
            <label htmlFor="myBotSelect">BOT1</label>
            <select
              id="myBotSelect"
              className="ws-select"
              value={myBot}
              onChange={(e) => setMyBot(e.target.value as BotName)}
            >
              <option value="me/bot1">me/bot1</option>
              <option value="me/bot2">me/bot2</option>
              <option value="me/bot3">me/bot3</option>
            </select>
          </div>

          <button className="btn btn-secondary" type="button" disabled>
            Save (placeholder)
          </button>
          <button className="btn btn-primary" type="button" disabled>
            Run / Preview (placeholder)
          </button>

          <div className="ws-status" role="status" aria-live="polite">
            {wsStatus}
          </div>
        </div>
      </header>

      <div className="ws-body">
        {!replay && !error && <div className="card" style={{ padding: 16 }}>Loading replay…</div>}
        {error && (
          <div className="card" style={{ padding: 16, borderColor: 'rgba(255, 107, 107, 0.4)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Failed to load replay</div>
            <div style={{ color: 'rgba(233, 239, 255, 0.72)' }}>{error}</div>
          </div>
        )}

        {replay && (
          <>
            <div className="ws-grid" role="main">
              <section className="panel" aria-label="Editor">
                <div className="panel-header">
                  <h2 className="panel-title">Editor</h2>
                  <div className="panel-meta">
                    Editing: <span>{myBot}</span>
                  </div>
                </div>
                <div className="panel-body">
                  <textarea
                    className="ws-editor-textarea"
                    spellCheck={false}
                    aria-label="BOT1 code editor"
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                  />
                </div>
              </section>

              <section className="panel" aria-label="Arena and replay controls">
                <div className="panel-header">
                  <h2 className="panel-title">Arena</h2>
                  <div className="panel-meta">{tickLabel}</div>
                </div>
                <div className="panel-body">
                  <div className="arena-viewport" aria-label="Arena viewport">
                    <ArenaCanvas replay={replay} tick={head.tick} p={playing ? head.p : 1} />
                  </div>

                  <div className="replay-controls" aria-label="Replay controls">
                    <div className="replay-controls-left">
                      <button className="btn btn-secondary" type="button" onClick={onPlayPause}>
                        {playing ? 'Pause' : 'Play'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => stepBy(1)}
                        disabled={playing}
                      >
                        Step +1
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={restart} disabled={playing}>
                        Restart
                      </button>
                    </div>

                    <div className="replay-controls-right">
                      <span className="chip">Inspecting: {inspectBot}</span>
                      <div>
                        <label htmlFor="speed" style={{ marginRight: 6 }}>
                          Speed
                        </label>
                        <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value) as Speed)}>
                          {SPEED_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}×
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <input
                      type="range"
                      min={0}
                      max={maxTick}
                      step={1}
                      value={playing ? Math.max(0, head.tick - 1) : head.tick}
                      onChange={(e) => onSeekTick(Number(e.target.value))}
                      aria-label="Replay tick"
                      disabled={playing}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </section>

              <section className="panel" aria-label="Help and inspector">
                <div className="panel-header">
                  <h2 className="panel-title">Inspector</h2>
                  <div className="panel-meta">Reference + bot stats (prototype)</div>
                </div>
                <div className="panel-body">
                  <div className="inspector-grid">
                    <div className="subcard">
                      <div className="subcard-title">Instruction cheatsheet</div>
                      <ul className="help-list">
                        <li>
                          <code>LABEL X</code> / <code>GOTO X</code>
                        </li>
                        <li>
                          <code>TARGET_POWERUP HEALTH|AMMO|ENERGY</code>
                        </li>
                        <li>
                          <code>MOVE_TO_TARGET</code>
                        </li>
                        <li>
                          <code>USE_SLOT1 TARGET</code>
                        </li>
                      </ul>
                      <div className="code-sample" aria-label="Cheatsheet example">
                        ; example
                        {'\n'}TARGET_POWERUP HEALTH
                        {'\n'}MOVE_TO_TARGET
                      </div>
                    </div>

                    <div className="subcard">
                      <div className="subcard-title">Bot list</div>
                      <div>
                        <label htmlFor="inspectBotSelect">Inspect</label>
                        <select
                          id="inspectBotSelect"
                          value={inspectBot}
                          onChange={(e) => setInspectBot(e.target.value as SlotId)}
                        >
                          <option value="BOT1">BOT1 (you)</option>
                          <option value="BOT2">BOT2 (builtin)</option>
                          <option value="BOT3">BOT3 (builtin)</option>
                          <option value="BOT4">BOT4 (builtin)</option>
                        </select>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <span style={{ color: 'rgba(233, 239, 255, 0.72)', fontSize: 12 }}>
                          Stats at tick:
                        </span>{' '}
                        <span style={{ color: 'rgba(233, 239, 255, 0.9)', fontSize: 12 }}>
                          (not wired)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <footer className="ws-loadout" aria-label="Loadout">
              <div className="panel-header ws-loadout-header">
                <h2 className="panel-title">Loadout (BOT1)</h2>
                <div className="panel-meta">3 slots (local-only in v1)</div>
              </div>

              <div className="ws-loadout-row">
                <div className="loadout-field">
                  <label htmlFor="slot1">Slot 1</label>
                  <select id="slot1" value={slot1} onChange={(e) => setSlot1(e.target.value as LoadoutSlot)}>
                    <option value="">(empty)</option>
                    <option value="BULLET">BULLET (weapon)</option>
                    <option value="SAW">SAW (weapon)</option>
                    <option value="SHIELD">SHIELD</option>
                    <option value="ARMOR">ARMOR</option>
                  </select>
                </div>

                <div className="loadout-field">
                  <label htmlFor="slot2">Slot 2</label>
                  <select id="slot2" value={slot2} onChange={(e) => setSlot2(e.target.value as LoadoutSlot)}>
                    <option value="">(empty)</option>
                    <option value="BULLET">BULLET (weapon)</option>
                    <option value="SAW">SAW (weapon)</option>
                    <option value="SHIELD">SHIELD</option>
                    <option value="ARMOR">ARMOR</option>
                  </select>
                </div>

                <div className="loadout-field">
                  <label htmlFor="slot3">Slot 3</label>
                  <select id="slot3" value={slot3} onChange={(e) => setSlot3(e.target.value as LoadoutSlot)}>
                    <option value="">(empty)</option>
                    <option value="BULLET">BULLET (weapon)</option>
                    <option value="SAW">SAW (weapon)</option>
                    <option value="SHIELD">SHIELD</option>
                    <option value="ARMOR">ARMOR</option>
                  </select>
                </div>
              </div>

              <p className="ws-loadout-note">
                Reminder: loadout affects movement speed (see Ruleset). (Not wired in prototype.)
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
