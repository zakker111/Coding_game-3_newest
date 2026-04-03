import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <>
      <h1 className="title">Not found</h1>
      <p className="subtitle">That route does not exist.</p>

      <div className="actions">
        <Link className="ui-button" to="/">
          Go home
        </Link>
      </div>
    </>
  )
}
