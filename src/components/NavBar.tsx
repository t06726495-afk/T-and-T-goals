import { NavLink } from 'react-router-dom'

// TODO: a bottom tab bar is easier to reach one-handed on a phone than a top
// bar — consider switching to a fixed bottom nav (with safe-area-inset-bottom
// padding) if the top bar feels like a stretch during daily use.
const SECTIONS = [
  { to: '/', label: 'Today' },
  { to: '/goals', label: 'Goals' },
  { to: '/partner', label: 'Partner' },
  { to: '/points', label: 'Points' },
  { to: '/planner', label: 'Planner' },
  { to: '/settings', label: 'Settings' },
]

export function NavBar() {
  return (
    <nav className="safe-top safe-x sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto px-3 py-2">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.to === '/'}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-mine/15 text-mine'
                  : 'text-ink-dim hover:text-ink'
              }`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
