import * as React from 'react'
import { Link } from 'react-router-dom'

export function LandingPage() {
  const startRef = React.useRef<HTMLAnchorElement | null>(null)

  React.useEffect(() => {
    startRef.current?.focus()
  }, [])

  return (
    <div className="page landing">
      <main className="card landing-card" aria-labelledby="landing-title">
        <h1 id="landing-title" className="landing-title">
          Nowt
        </h1>
        <p className="landing-subtitle">
          Code a bot. Run a deterministic 4-bot match locally. Replay it tick-by-tick (with smooth motion during
          playback).
        </p>

        <ul className="landing-bullets" aria-label="What you can do">
          <li>Write your bot (BOT1) in the DSL</li>
          <li>Battle 3 built-in opponents</li>
          <li>Scrub replays and inspect per-tick state</li>
        </ul>

        <div className="landing-actions">
          <Link ref={startRef} className="btn btn-primary" to="/workshop">
            Start Game
          </Link>
        </div>

        <p className="landing-footnote">Prototype UI only — no login required. v{__APP_VERSION__}</p>
      </main>
    </div>
  )
}
