import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/">
          Nowt
        </NavLink>

        <nav className="nav">
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/" end>
            Home
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            to="/workshop"
          >
            Workshop
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/docs">
            Docs
          </NavLink>
        </nav>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>Nowt</span>
          <span className="muted">v{__APP_VERSION__}</span>
        </div>
      </footer>
    </div>
  )
}
