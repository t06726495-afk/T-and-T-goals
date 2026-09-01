import { Link } from 'react-router-dom'
import { GearSix } from '@phosphor-icons/react'

// Settings stopped being a tab, so it needs a fixed home. Top-right on every
// screen is where people already look for it, and it costs no space in the
// bar, where the room is worth more.
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  /** Optional trailing content, shown to the left of the gear. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {children}
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-dim transition-transform active:scale-90"
        >
          <GearSix size={22} />
        </Link>
      </div>
    </div>
  )
}
