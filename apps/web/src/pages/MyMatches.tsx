import React from 'react'
import { Link } from 'react-router-dom'
import { summarizeBotMatch, type BotMatchSummary } from '@coding-game/replay'

import {
  fetchServerDailyRunMatches,
  fetchServerMatchReplay,
  type ServerDailyRunMatch,
} from '../serverClient'

type Props = {
  baseUrl: string
  runId: string
  username: string
}

type MatchRow = {
  match: ServerDailyRunMatch
  slot: string
  botId: string
  rank: number | null
  points: number | null
  won: boolean
}

export function replayLinkFor(matchId: string, slot: string): string {
  return `/workshop?replayMatch=${encodeURIComponent(matchId)}&slot=${encodeURIComponent(slot)}`
}

export function buildRows(matches: ServerDailyRunMatch[], username: string): MatchRow[] {
  const prefix = `${username}/`
  const rows: MatchRow[] = []
  for (const match of matches) {
    const mine = match.participants.find((participant) => participant.displayName.startsWith(prefix))
    if (!mine) continue
    const placement = match.result?.placements?.find((entry) => entry.slot === mine.slot)
    rows.push({
      match,
      slot: mine.slot,
      botId: mine.displayName,
      rank: placement?.rank ?? null,
      points: placement?.points ?? null,
      won: match.result?.winnerSlot === mine.slot,
    })
  }
  return rows
}

function formatTick(tick: number): string {
  return `tick ${tick}`
}

function SummaryView({ summary }: { summary: BotMatchSummary }) {
  const first = summary.firstDamageTaken
  const peak = summary.mostDamageTick
  const last = summary.lastInstructions
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 14 }}>
      <div>
        Damage taken: <strong>{Math.round(summary.totalDamageTaken)}</strong> · dealt:{' '}
        <strong>{Math.round(summary.totalDamageDealt)}</strong>
      </div>
      <div>
        {first ? (
          <>
            First hit: {formatTick(first.tick)} for {Math.round(first.amount)} by {first.source ?? 'unknown'}
            {first.attackerBotId ? ` (${first.attackerBotId})` : ''}.
          </>
        ) : (
          'Never hit.'
        )}
      </div>
      <div>
        {peak ? (
          <>
            Most damage in one tick: {formatTick(peak.tick)}, {Math.round(peak.amount)} total from{' '}
            {Object.entries(peak.bySource)
              .map(([source, amount]) => `${source} ${Math.round(amount)}`)
              .join(', ')}
            .
          </>
        ) : null}
      </div>
      <div>
        {summary.died
          ? `Died at ${formatTick(summary.died.tick)}${summary.died.killedBy ? `, credited to ${summary.died.killedBy}` : ''}.`
          : summary.survivedToEnd
            ? 'Survived to the end.'
            : 'Not alive at the end.'}
        {summary.endReason ? ` Match ended: ${summary.endReason}.` : ''}
      </div>
      {summary.finalState ? (
        <div>
          Final state: HP {Math.round(summary.finalState.hp)}, ammo {Math.round(summary.finalState.ammo)}, energy{' '}
          {Math.round(summary.finalState.energy)}.
        </div>
      ) : null}
      <div>
        <strong>Last {last.length} instructions</strong>
        {last.length ? (
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontFamily: 'monospace', fontSize: 13 }}>
            {last.map((entry) => (
              <li key={`${entry.tick}-${entry.instrText}`}>
                t{entry.tick}: {entry.instrText} → {entry.result}
                {entry.reason ? ` (${entry.reason})` : ''}
              </li>
            ))}
          </ol>
        ) : (
          <div className="muted">No instructions recorded.</div>
        )}
      </div>
    </div>
  )
}

export function MyMatches({ baseUrl, runId, username }: Props) {
  const [rows, setRows] = React.useState<MatchRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [summaries, setSummaries] = React.useState<Record<string, BotMatchSummary | { error: string }>>({})

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchServerDailyRunMatches(baseUrl, runId)
      .then((response) => {
        if (!cancelled) setRows(buildRows(response.matches, username))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl, runId, username])

  async function toggle(row: MatchRow) {
    const id = row.match.matchId
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    if (summaries[id]) return
    try {
      const replay = await fetchServerMatchReplay(baseUrl, id)
      const summary = summarizeBotMatch(replay, row.slot)
      setSummaries((current) => ({ ...current, [id]: summary }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSummaries((current) => ({
        ...current,
        [id]: { error: `Replay not available: ${message}` },
      }))
    }
  }

  if (loading) return <div className="muted">Loading your matches…</div>
  if (error) return <div className="muted">Could not load your matches: {error}</div>
  if (!rows.length) return <div className="muted">None of your bots played in this run.</div>

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((row) => {
        const id = row.match.matchId
        const open = openId === id
        const summary = summaries[id]
        const label = row.won ? 'Won' : row.rank ? `Placed #${row.rank}` : 'Lost'
        const points = row.points != null ? ` · ${row.points} pts` : ''
        return (
          <div key={id} className="panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>
                <strong>{row.botId}</strong> · {label}{points} · {row.match.result?.endReason ?? 'in progress'}
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="ui-button ui-button-secondary" type="button" onClick={() => toggle(row)}>
                  {open ? 'Hide' : row.won ? 'Show match' : 'Why did I lose?'}
                </button>
                <Link
                  className="ui-button ui-button-secondary"
                  to={replayLinkFor(id, row.slot)}
                >
                  Open replay
                </Link>
              </span>
            </div>
            {open ? (
              summary && 'error' in summary ? (
                <div className="muted" style={{ marginTop: 10 }}>
                  {summary.error}
                </div>
              ) : summary ? (
                <SummaryView summary={summary} />
              ) : (
                <div className="muted" style={{ marginTop: 10 }}>
                  Loading replay…
                </div>
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
