import React from 'react'
import { useNavigate } from 'react-router-dom'

function formatMarketingVersion(version: string) {
  const m = /^0\.0\.(\d+)$/.exec(version)
  if (!m) return version
  return `0.0${m[1]}`
}

const STARTER_SNIPPET = `; Aggressive starter (BULLET in SLOT1)
LABEL LOOP
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH)) DO MOVE_TO_POWERUP HEALTH
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET
GOTO LOOP`

export function LandingPage() {
  const nav = useNavigate()
  const startRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    startRef.current?.focus()
  }, [])

  return (
    <div className="landing">
      <div className="landing-card panel">
        <h1 className="title">Nowt</h1>
        <p className="subtitle">
          A deterministic bot-fighting coding game. Write bots, run matches, and inspect replays tick-by-tick.
        </p>
        <p className="muted" style={{ marginTop: 6 }}>
          v{formatMarketingVersion(__APP_VERSION__)}
        </p>

        <div className="actions">
          <button
            ref={startRef}
            className="ui-button"
            onClick={() => nav('/workshop')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') nav('/workshop')
            }}
          >
            Start Game
          </button>

          <button className="ui-button ui-button-secondary" onClick={() => nav('/docs')}>
            Bot instructions
          </button>
        </div>

        <div style={{ marginTop: 18 }} className="panel landing-features">
          <div className="row">
            <div style={{ flex: '1 1 240px' }}>
              <strong>Deterministic</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Same seed + same inputs → identical outcome.
              </div>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <strong>Replayable</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Inspect matches with per-tick state and events.
              </div>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <strong>Easy to script</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Tiny DSL: loops, IFs, movement goals, and module actions.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="panel-title">A tiny bot script</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Built-ins include aggressive bots like <strong style={{ color: 'var(--text)' }}>Burst Hunter</strong> and{' '}
            <strong style={{ color: 'var(--text)' }}>Energy Saw Skirmisher</strong>.
          </div>
          <pre className="docs-pre" style={{ marginTop: 10, maxHeight: 260 }}>
            {STARTER_SNIPPET}
          </pre>
        </div>
      </div>
    </div>
  )
}
