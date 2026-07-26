import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { todayInTimezone } from '../lib/date'
import { currentStreak, lastSevenDayFractions } from '../lib/streak'
import type { Goal, GoalLog, Profile } from '../lib/types'

const STREAK_LOOKBACK_DAYS = 60

export function PartnerPage() {
  const { profile } = useAuth()
  const [partner, setPartner] = useState<Profile | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [logsByGoal, setLogsByGoal] = useState<Map<string, Map<string, GoalLog>>>(new Map())
  const [loading, setLoading] = useState(true)

  const today = profile ? todayInTimezone(profile.timezone) : new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const { data: sharedGoals } = await supabase
      .from('goals')
      .select('*')
      .neq('owner_id', profile.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    const shared = (sharedGoals as Goal[]) ?? []
    setGoals(shared)

    if (shared.length > 0) {
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', shared[0].owner_id)
        .maybeSingle()
      setPartner((partnerProfile as Profile) ?? null)

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - STREAK_LOOKBACK_DAYS)
      const { data: logs } = await supabase
        .from('goal_logs')
        .select('*')
        .in(
          'goal_id',
          shared.map((g) => g.id),
        )
        .gte('log_date', cutoff.toISOString().slice(0, 10))

      const map = new Map<string, Map<string, GoalLog>>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        if (!map.has(log.goal_id)) map.set(log.goal_id, new Map())
        map.get(log.goal_id)!.set(log.log_date, log)
      }
      setLogsByGoal(map)
    } else {
      setPartner(null)
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Partner</h1>

      {!partner ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-ink">Nothing shared yet</p>
          <p className="mt-1 text-sm text-ink-dim">
            Once she marks a goal as shared, it'll show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-partner/20 bg-surface p-4">
            <span className="text-2xl">{partner.avatar_emoji}</span>
            <p className="font-medium text-ink">{partner.display_name}</p>
          </div>

          <div className="mt-4 space-y-3">
            {goals.map((goal) => {
              const logs = logsByGoal.get(goal.id)
              const completedDates = new Set(
                [...(logs?.values() ?? [])].filter((l) => l.completed).map((l) => l.log_date),
              )
              const streak = currentStreak(completedDates, today)
              const week = lastSevenDayFractions(
                logs,
                today,
                goal.kind === 'counter' ? goal.target_per_day : null,
              )
              return (
                <div key={goal.id} className="rounded-2xl border border-partner/20 bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.emoji}</span>
                    <div className="flex-1">
                      <p className="font-medium text-ink">{goal.title}</p>
                      {streak > 0 && (
                        <p className="text-xs text-ink-dim">
                          🔥 {streak} day{streak === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-1" style={{ height: 22 }}>
                    {week.map((d) => (
                      <span
                        key={d.date}
                        className="relative flex-1 overflow-hidden rounded-md bg-border"
                        style={{ height: 22 }}
                      >
                        <span
                          className="absolute bottom-0 left-0 w-full rounded-md transition-all duration-500"
                          style={{
                            height: `${d.fraction * 100}%`,
                            backgroundColor: goal.color,
                            opacity: d.done ? 1 : 0.75,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-6 text-center text-xs text-ink-dim">
            Nudges and the shared activity feed arrive in Phase 6.
          </p>
        </>
      )}
    </div>
  )
}
