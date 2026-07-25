import { InstallStatus } from '../components/InstallStatus'

export function TodayPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Hey 👋</h1>
      <p className="mt-1 text-ink-dim">
        This is <span className="text-him">mogging</span> — install it, and
        we'll build the rest from here.
      </p>

      <div className="mt-6">
        <InstallStatus />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm text-ink-dim">
        Today's tasks, goals, and points will show up here in Phase 3.
      </div>
    </div>
  )
}
