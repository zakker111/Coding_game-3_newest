import React from 'react'
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
      nav('/workshop')
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
