import { NavLink } from 'react-router-dom'
import {
  ChartLineUp,
  GearSix,
  Heart,
  House,
  Sparkle,
  Target,
  type Icon,
} from '@phosphor-icons/react'

// Bottom tab bar rather than a top one: on a phone the top of the screen is
// the hardest place to reach with a thumb, and this is an app you open
// several times a day one-handed. The active tab switches to the filled icon
// weight, which is how you tell state apart at 22px without relying on
// colour alone.
const SECTIONS: { to: string; label: string; icon: Icon }[] = [
  { to: '/', label: 'Today', icon: House },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/partner', label: 'Partner', icon: Heart },
  { to: '/points', label: 'Points', icon: ChartLineUp },
  { to: '/planner', label: 'Planner', icon: Sparkle },
  { to: '/settings', label: 'Settings', icon: GearSix },
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
                  size={23}
                  weight={isActive ? 'fill' : 'regular'}
                  className={isActive ? 'text-mine' : 'text-ink-dim'}
                />
                <span
                  className={`text-[10px] leading-none ${
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
