import React from 'react'
import { Link } from 'react-router-dom'
import type { Replay, SlotId } from '@coding-game/replay'

import { getDefaultServerBaseUrl } from '../config'
import {
  fetchLatestServerDailyRun,
  fetchServerDailyRunMatches,
  fetchServerMatchReplay,
  fetchServerMe,
  type ServerDailyRun,
  type ServerDailyRunMatch,
  type ServerUser,
} from '../serverClient'
import { initialPlaybackState, playbackReducer } from '../replay/playbackReducer'
import { getAppearanceColorMap, getBotsForPlayback, SLOT_IDS } from '../replay/interpolate'
import { ArenaCanvas, type ArenaRenderState } from '../ui/arena'

function formatWinner(match: ServerDailyRunMatch) {
  if (!match.result?.winnerSlot) return 'Draw'
  const winner = match.participants.find((p) => p.slot === match.result?.winnerSlot)
  return winner?.displayName ?? match.result.winnerSlot
}

function MatchReplayViewer({ replay }: { replay: Replay }) {
  const [playback, dispatch] = React.useReducer(playbackReducer, initialPlaybackState)
  const animationRef = React.useRef<number>(0)
  const lastTimeRef = React.useRef<number>(0)

  React.useEffect(() => {
    dispatch({ type: 'LOAD_REPLAY', replay })
  }, [replay])

  React.useEffect(() => {
    if (!playback.playing) {
      cancelAnimationFrame(animationRef.current)
      return
    }

    function animate(time: number) {
      if (lastTimeRef.current === 0) lastTimeRef.current = time
      const elapsed = time - lastTimeRef.current
      const ticksPerFrame = (elapsed / 1000) * playback.speed
      lastTimeRef.current = time

      if (ticksPerFrame >= 1) {
        dispatch({ type: 'STEP', delta: Math.trunc(ticksPerFrame) })
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = 0
    animationRef.current = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationRef.current)
  }, [playback.playing, playback.speed])

  const colorMap = React.useMemo(() => getAppearanceColorMap(replay), [replay])

  const arenaState: ArenaRenderState = React.useMemo(() => {
    if (!playback.replay) return { bots: [] }
    const bots = getBotsForPlayback(playback.replay, playback.tick, 1)
    return {
      bots: bots.map((b) => ({
        ...b,
        slotId: b.botId as SlotId,
        appearanceColor: colorMap[b.botId as SlotId],
        displayName: replay.bots.find((rb) => rb.slotId === b.botId)?.displayName ?? b.botId,
      })),
    }
  }, [playback.replay, playback.tick, colorMap, replay.bots])

  const tickCap = replay.tickCap

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          className="ui-button ui-button-secondary"
          style={{ padding: '4px 12px', fontSize: 13 }}
          onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
        >
          {playback.playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="ui-button ui-button-secondary"
          style={{ padding: '4px 12px', fontSize: 13 }}
          onClick={() => dispatch({ type: 'RESTART' })}
        >
          Restart
        </button>
        <input
          type="range"
          min={0}
          max={tickCap}
          value={playback.tick}
          onChange={(e) => dispatch({ type: 'SET_TICK', tick: Number(e.target.value) })}
          style={{ flex: 1, minWidth: 100 }}
        />
        <span className="muted" style={{ fontSize: 13, minWidth: 60 }}>
          Tick {playback.tick}/{tickCap}
        </span>
        <select
          className="admin-input"
          style={{ width: 64, fontSize: 13 }}
          value={playback.speed}
          onChange={(e) => dispatch({ type: 'SET_SPEED', speed: Number(e.target.value) as 0.5 | 1 | 2 | 6 })}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={6}>6x</option>
        </select>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxWidth: 400 }}>
        <ArenaCanvas renderState={arenaState} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 8 }}>
        {(SLOT_IDS as readonly SlotId[]).map((slotId) => {
          const bot = arenaState.bots.find((b) => b.slotId === slotId)
          if (!bot) return null
          return (
            <div key={slotId} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              <span style={{ color: bot.appearanceColor ?? 'var(--text)', fontWeight: 600 }}>{bot.displayName}</span>
              <span className="muted" style={{ marginLeft: 6 }}>
                HP:{bot.hp} {!bot.alive ? '(dead)' : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LeaderboardPage() {
  const [run, setRun] = React.useState<ServerDailyRun | null>(null)
  const [user, setUser] = React.useState<ServerUser | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [matches, setMatches] = React.useState<ServerDailyRunMatch[]>([])
  const [selectedMatchId, setSelectedMatchId] = React.useState<string | null>(null)
  const [replay, setReplay] = React.useState<Replay | null>(null)
  const [replayLoading, setReplayLoading] = React.useState(false)
  const [replayError, setReplayError] = React.useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)

    try {
      const baseUrl = getDefaultServerBaseUrl()
      const [me, latestRun] = await Promise.all([fetchServerMe(baseUrl), fetchLatestServerDailyRun(baseUrl)])
      setUser(me.user)
      setRun(latestRun)

      if (latestRun?.runId) {
        const runMatches = await fetchServerDailyRunMatches(baseUrl, latestRun.runId)
        setMatches(runMatches.matches)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRun(null)
      setMatches([])
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void refresh()
  }, [])

  async function handleWatchReplay(matchId: string) {
    if (selectedMatchId === matchId && replay) {
      setSelectedMatchId(null)
      setReplay(null)
      return
    }

    setSelectedMatchId(matchId)
    setReplay(null)
    setReplayLoading(true)
    setReplayError(null)

    try {
      const baseUrl = getDefaultServerBaseUrl()
      const data = await fetchServerMatchReplay(baseUrl, matchId)
      setReplay(data as Replay)
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : String(err))
    } finally {
      setReplayLoading(false)
    }
  }

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

      {matches.length ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title">Matches</div>
          <div className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
            Click a match to watch its replay.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {matches.slice(0, 50).map((match) => (
              <div key={match.matchId}>
                <div
                  className="admin-match-row"
                  style={{ cursor: 'pointer', borderColor: selectedMatchId === match.matchId ? 'rgba(34, 197, 94, 0.6)' : undefined }}
                  onClick={() => handleWatchReplay(match.matchId)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{match.matchId}</strong>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {match.participants.map((p) => p.displayName).join(' vs ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="muted" style={{ fontSize: 13 }}>Winner: {formatWinner(match)}</div>
                      <button
                        className="ui-button ui-button-secondary"
                        style={{ padding: '2px 10px', fontSize: 12, marginTop: 4 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleWatchReplay(match.matchId)
                        }}
                      >
                        {selectedMatchId === match.matchId && replay ? 'Hide' : 'Watch'}
                      </button>
                    </div>
                  </div>
                  {match.result?.placements?.length ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {match.result.placements
                        .map((p) => {
                          const participant = match.participants.find((e) => e.slot === p.slot)
                          return `#${p.rank} ${participant?.displayName ?? p.slot} (${p.points} pts)`
                        })
                        .join(' · ')}
                    </div>
                  ) : null}
                </div>
                {selectedMatchId === match.matchId ? (
                  <div style={{ padding: '8px 10px' }}>
                    {replayLoading ? <div className="muted">Loading replay…</div> : null}
                    {replayError ? <div style={{ color: '#fecaca' }}>Error: {replayError}</div> : null}
                    {replay ? <MatchReplayViewer replay={replay} /> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
