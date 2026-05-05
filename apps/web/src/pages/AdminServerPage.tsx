import React from 'react'

import {
  createServerDailyRun,
  fetchServerDailyRunMatches,
  fetchServerMe,
  listServerDailyRuns,
  loginServerUser,
  logoutServerUser,
  type ServerDailyRun,
  type ServerDailyRunMatch,
  type ServerUser,
} from '../serverClient'
import { getDefaultServerBaseUrl } from '../config'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatWinner(match: ServerDailyRunMatch) {
  if (!match.result?.winnerSlot) return 'Tie / no single winner'
  const winner = match.participants.find((participant) => participant.slot === match.result?.winnerSlot)
  return winner?.displayName ?? match.result.winnerSlot
}

export function AdminServerPage() {
  const [baseUrl, setBaseUrl] = React.useState(getDefaultServerBaseUrl)
  const [username, setUsername] = React.useState('admin')
  const [password, setPassword] = React.useState('admin')
  const [user, setUser] = React.useState<ServerUser | null>(null)
  const [runs, setRuns] = React.useState<ServerDailyRun[]>([])
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const [matches, setMatches] = React.useState<ServerDailyRunMatch[]>([])
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function refresh(nextRunId = selectedRunId) {
    const [me, runList] = await Promise.all([fetchServerMe(baseUrl), listServerDailyRuns(baseUrl)])
    setUser(me.user)
    setRuns(runList.runs)

    const runId = nextRunId ?? runList.runs[0]?.runId ?? null
    setSelectedRunId(runId)
    if (runId) {
      const runMatches = await fetchServerDailyRunMatches(baseUrl, runId)
      setMatches(runMatches.matches)
    } else {
      setMatches([])
    }
  }

  React.useEffect(() => {
    refresh().catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await loginServerUser(baseUrl, { username, password })
      setUser(result.user)
      setNotice(
        result.user.username === 'admin'
          ? `Logged in as ${result.user.username}`
          : 'Logged in, but daily run controls require admin.'
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await logoutServerUser(baseUrl)
      setUser(null)
      setNotice('Logged out')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRunDaily() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const run = await createServerDailyRun(baseUrl, {
        runDate: today(),
        seed: `daily:${today()}`,
        tickCap: 120,
        maxRounds: 1,
      })
      setNotice(`Daily run complete: ${run.matchIds.length} matches`)
      await refresh(run.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const selectedRun = runs.find((run) => run.runId === selectedRunId) ?? null
  const isAdmin = user?.username === 'admin'

  return (
    <div className="admin-page">
      <div className="panel">
        <h1 className="workshop-title">Server sandbox</h1>
        <p className="subtitle">
          Minimal admin view for server-side daily games. Login with admin/admin, run daily matches, and inspect points.
        </p>

        <form className="admin-login" onSubmit={handleLogin}>
          <label className="mini-field">
            <span className="mini-label">Server URL</span>
            <input className="admin-input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
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
          <button className="ui-button" disabled={busy} type="submit">
            Login
          </button>
          {user ? (
            <button className="ui-button ui-button-secondary" disabled={busy} type="button" onClick={handleLogout}>
              Logout {user.username}
            </button>
          ) : null}
        </form>

        {notice ? <p className="admin-notice">{notice}</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}

        {isAdmin ? (
          <div className="actions">
            <button className="ui-button" disabled={busy} onClick={handleRunDaily}>
              Run daily games
            </button>
            <button className="ui-button ui-button-secondary" disabled={busy} onClick={() => refresh()}>
              Refresh
            </button>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            Admin controls are shown only when logged in as admin.
          </p>
        )}
      </div>

      {selectedRun ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="workshop-setup-header">
            <div>
              <div className="panel-title">Daily run {selectedRun.runId}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {selectedRun.matchIds.length} matches · {selectedRun.rulesetVersion} · {selectedRun.status}
              </div>
            </div>
            <select
              className="admin-input"
              value={selectedRunId ?? ''}
              onChange={async (event) => {
                const runId = event.target.value
                setSelectedRunId(runId)
                const runMatches = await fetchServerDailyRunMatches(baseUrl, runId)
                setMatches(runMatches.matches)
              }}
            >
              {runs.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.runId} · {run.runDate}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-grid" style={{ marginTop: 16 }}>
            <div>
              <div className="panel-title">Points</div>
              <div className="admin-table" style={{ marginTop: 10 }}>
                {(selectedRun.summary?.leaderboard ?? []).map((entry, index) => (
                  <div className="admin-table-row" key={entry.botId}>
                    <span>{index + 1}. {entry.botId}</span>
                    <span>{entry.points} pts</span>
                    <span>{entry.matchesPlayed} matches</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="panel-title">Matches</div>
              <div className="admin-table" style={{ marginTop: 10 }}>
                {matches.slice(0, 80).map((match) => (
                  <div className="admin-match-row" key={match.matchId}>
                    <div>
                      <strong>{match.matchId}</strong>
                      <div className="muted">{match.participants.map((participant) => participant.displayName).join(' vs ')}</div>
                    </div>
                    <div className="muted">Winner: {formatWinner(match)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
