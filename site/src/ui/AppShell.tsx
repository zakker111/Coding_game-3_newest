import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Bot Arena
        </Link>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Home
          </NavLink>
          <NavLink
            to="/workshop"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            Workshop
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  )
}
