import React from 'react'
import { Link } from 'react-router-dom'

import botInstructionsText from '../../../../BotInstructions.md?raw'

export function DocsPage() {
  return (
    <>
      <div className="workshop-header">
        <div>
          <h1 className="workshop-title">Bot instructions</h1>
          <div className="subtitle">Quick guide + full reference for the stable v1 bot language.</div>
        </div>

        <div className="workshop-header-actions">
          <Link className="ui-button ui-button-secondary" to="/workshop">
            Back to Workshop
          </Link>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <pre className="docs-pre">{botInstructionsText}</pre>
      </section>
    </>
  )
}
