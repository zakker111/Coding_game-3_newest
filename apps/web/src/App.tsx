import React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

export default function App() {
  const location = useLocation()
  const isWorkshopRoute = location.pathname === '/workshop'

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

      <main className={['page', isWorkshopRoute ? 'page--workshop' : ''].filter(Boolean).join(' ')}>
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
