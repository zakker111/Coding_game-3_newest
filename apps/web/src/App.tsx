import React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getDefaultServerBaseUrl } from './config'
import { fetchServerMe } from './serverClient'

export default function App() {
  const location = useLocation()
  const isWorkshopRoute = location.pathname === '/workshop'
  const [isAdmin, setIsAdmin] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    fetchServerMe(getDefaultServerBaseUrl())
      .then((result) => {
        if (!cancelled) {
          setIsAdmin(result.user?.username === 'admin')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [location.pathname])

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
          {isAdmin ? (
            <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/admin">
              Server
            </NavLink>
          ) : null}
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
