import React from 'react'
import { Link } from 'react-router-dom'

import { getDefaultServerBaseUrl } from '../config'
import { fetchLatestServerDailyRun, fetchServerMe, type ServerDailyRun, type ServerUser } from '../serverClient'

export function LeaderboardPage() {
  const [run, setRun] = React.useState<ServerDailyRun | null>(null)
  const [user, setUser] = React.useState<ServerUser | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)

    try {
      const baseUrl = getDefaultServerBaseUrl()
      const [me, latestRun] = await Promise.all([fetchServerMe(baseUrl), fetchLatestServerDailyRun(baseUrl)])
      setUser(me.user)
      setRun(latestRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRun(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void refresh()
  }, [])

  const leaderboard = run?.summary?.leaderboard ?? []

  return (
    <div className="leaderboard-page">
      <section className="panel">
        <div className="workshop-setup-header">
          <div>
            <h1 className="workshop-title">Daily leaderboard</h1>
            <p className="subtitle">
              Latest daily results from saved server bots. Your bots are highlighted when you are logged in.
            </p>
          </div>
          <button className="ui-button ui-button-secondary" type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {run ? (
          <div className="muted" style={{ marginTop: 12 }}>
            Run <strong style={{ color: 'var(--text)' }}>{run.runId}</strong> · {run.runDate} · {run.matchIds.length} matches
          </div>
        ) : null}

        {error ? (
          <div className="panel" style={{ marginTop: 16, borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <strong style={{ color: '#fecaca' }}>No daily results yet</strong>
            <div className="muted" style={{ marginTop: 8 }}>
              {error}. Admin needs to run daily games before the public leaderboard has results.
            </div>
            <div style={{ marginTop: 12 }}>
              <Link className="ui-button ui-button-secondary" to="/workshop">
                Go to Workshop
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {leaderboard.length ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="leaderboard-table">
            <div className="leaderboard-row leaderboard-row--header">
              <span>Rank</span>
              <span>Bot</span>
              <span>Points</span>
              <span>Wins</span>
              <span>Matches</span>
              <span>Average</span>
            </div>
            {leaderboard.map((entry, index) => {
              const isMine = user ? entry.botId.startsWith(`${user.username}/`) : false
              return (
                <div className={['leaderboard-row', isMine ? 'leaderboard-row--mine' : ''].filter(Boolean).join(' ')} key={entry.botId}>
                  <span>#{index + 1}</span>
                  <span>{entry.botId}</span>
                  <strong>{entry.points}</strong>
                  <span>{entry.wins}</span>
                  <span>{entry.matchesPlayed}</span>
                  <span>{entry.averagePoints.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
