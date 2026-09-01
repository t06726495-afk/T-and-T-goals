import { NavLink } from 'react-router-dom'
import { ChartLineUp, House, Target, type Icon } from '@phosphor-icons/react'

// Three tabs, down from six. Planner and Partner were destinations you visit
// once a week sitting beside ones you open several times a day, which made
// the app look busier than it is. The planner is now a button on Goals, where
// you already are when you want a plan; the partner's side of things sits
// next to your own on Today and Goals rather than in a separate room.
// Settings is a gear in the header.
//
// Bottom bar rather than top: on a phone the top of the screen is the hardest
// place to reach one-handed. The active tab switches to the filled icon
// weight, so state doesn't depend on colour alone.
const SECTIONS: { to: string; label: string; icon: Icon }[] = [
  { to: '/', label: 'Today', icon: House },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/points', label: 'Points', icon: ChartLineUp },
]

export function NavBar() {
  return (
    // z-20 keeps the bar under the sheets and modals (z-30+), which have to
    // be able to cover it.
    <nav className="safe-x fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur-xl">
      <div
        className="mx-auto flex max-w-2xl items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {SECTIONS.map(({ to, label, icon: IconComponent }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 transition-transform active:scale-95"
          >
            {({ isActive }) => (
              <>
                <IconComponent
                  size={25}
                  weight={isActive ? 'fill' : 'regular'}
                  className={isActive ? 'text-mine' : 'text-ink-dim'}
                />
                <span
                  className={`text-[11px] leading-none ${
                    isActive ? 'font-semibold text-mine' : 'font-medium text-ink-dim'
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
