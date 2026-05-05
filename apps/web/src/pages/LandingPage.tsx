import React from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { getDefaultServerBaseUrl } from '../config'
import { loginServerUser, registerServerUser } from '../serverClient'

function formatMarketingVersion(version: string) {
  const m = /^0\.0\.(\d+)$/.exec(version)
  if (!m) return version
  return `0.0${m[1]}`
}

export function LandingPage() {
  const nav = useNavigate()
  const usernameRef = React.useRef<HTMLInputElement | null>(null)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loginNotice, setLoginNotice] = React.useState<string | null>(null)
  const [loginError, setLoginError] = React.useState<string | null>(null)
  const [loginBusy, setLoginBusy] = React.useState(false)

  React.useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  async function handleAuth(event: React.FormEvent, mode: 'login' | 'register') {
    event.preventDefault()
    setLoginBusy(true)
    setLoginNotice(null)
    setLoginError(null)

    try {
      const body = { username, password }
      const result =
        mode === 'register'
          ? await registerServerUser(getDefaultServerBaseUrl(), body)
          : await loginServerUser(getDefaultServerBaseUrl(), body)
      setLoginNotice(`${mode === 'register' ? 'Created account' : 'Logged in'} as ${result.user.username}`)
      nav(result.user.username === 'admin' ? '/admin' : '/workshop')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <section className="landing-hero panel">
          <div>
            <div className="landing-kicker">Deterministic bot arena · v{formatMarketingVersion(__APP_VERSION__)}</div>
            <h1 className="title">Write the bot. Watch the fight.</h1>
            <p className="subtitle">
              Nowt is a coding game where your tiny script controls a combat bot. Save loadouts, run daily matches, and inspect every tick of the replay.
            </p>
            <div className="landing-actions">
              <Link className="ui-button" to="/workshop">
                Open Workshop
              </Link>
              <Link className="ui-button ui-button-secondary" to="/leaderboard">
                View leaderboard
              </Link>
              <Link className="ui-button ui-button-secondary" to="/docs">
                Learn bot code
              </Link>
            </div>
          </div>
          <div className="landing-score-card" aria-label="Game summary">
            <div>
              <span>Modules</span>
              <strong>10</strong>
            </div>
            <div>
              <span>Daily scoring</span>
              <strong>3 / 2 / 1 / 0</strong>
            </div>
            <div>
              <span>Replay</span>
              <strong>Tick by tick</strong>
            </div>
          </div>
        </section>

        <section className="landing-feature-grid" aria-label="Game features">
          <div className="landing-feature panel">
            <strong>Code simply</strong>
            <span>Use readable instructions like <code>TARGET_CLOSEST</code>, <code>USE_SLOT1 TARGET</code>, and <code>HEALTH_LOW()</code>.</span>
          </div>
          <div className="landing-feature panel">
            <strong>Build loadouts</strong>
            <span>Pick weapons and tools like bullet, sniper, rocket, shield, mine, repair drone, and teleport.</span>
          </div>
          <div className="landing-feature panel">
            <strong>Compete daily</strong>
            <span>Saved server bots enter ranked daily matches and earn points from placements.</span>
          </div>
        </section>

        <form className="landing-login panel" onSubmit={(event) => handleAuth(event, 'login')}>
          <div>
            <div className="panel-title">Login</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Create a user or login. New users get a Workshop with three starter bots.
            </div>
          </div>
          <label className="mini-field">
            <span className="mini-label">Username</span>
            <input ref={usernameRef} className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} />
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
          <button className="ui-button ui-button-secondary" disabled={loginBusy} type="button" onClick={(event) => handleAuth(event, 'register')}>
            Make new user
          </button>
          <button className="ui-button ui-button-secondary" type="button" onClick={() => nav('/docs')}>
            Bot instructions
          </button>
          {loginNotice ? <span className="admin-notice">{loginNotice}</span> : null}
          {loginError ? <span className="admin-error">{loginError}</span> : null}
        </form>
      </div>
    </div>
  )
}
