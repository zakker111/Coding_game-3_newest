import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getDefaultServerBaseUrl, loginServerUser } from '../serverClient'

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
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET
GOTO LOOP`

export function LandingPage() {
  const nav = useNavigate()
  const startRef = React.useRef<HTMLButtonElement | null>(null)
  const [username, setUsername] = React.useState('admin')
  const [password, setPassword] = React.useState('admin')
  const [loginNotice, setLoginNotice] = React.useState<string | null>(null)
  const [loginError, setLoginError] = React.useState<string | null>(null)
  const [loginBusy, setLoginBusy] = React.useState(false)

  React.useEffect(() => {
    startRef.current?.focus()
  }, [])

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setLoginBusy(true)
    setLoginNotice(null)
    setLoginError(null)

    try {
      const result = await loginServerUser(getDefaultServerBaseUrl(), { username, password })
      setLoginNotice(`Logged in as ${result.user.username}`)
      if (result.user.username === 'admin') {
        nav('/admin')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

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

        <form className="landing-login panel" onSubmit={handleLogin}>
          <div>
            <div className="panel-title">Login</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Default admin: admin / admin
            </div>
          </div>
          <label className="mini-field">
            <span className="mini-label">Username</span>
            <input className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="mini-field">
            <span className="mini-label">Password</span>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="ui-button" disabled={loginBusy} type="submit">
            Login
          </button>
          {loginNotice ? <span className="admin-notice">{loginNotice}</span> : null}
          {loginError ? <span className="admin-error">{loginError}</span> : null}
        </form>

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
