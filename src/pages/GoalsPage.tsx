import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { todayInTimezone } from '../lib/date'
import { currentStreak, lastSevenDays } from '../lib/streak'
import { GoalFormSheet } from '../components/GoalFormSheet'
import type { Goal, GoalLog, Profile } from '../lib/types'

const STREAK_LOOKBACK_DAYS = 60

export function GoalsPage() {
  const { profile, coupleId } = useAuth()
  const [myGoals, setMyGoals] = useState<Goal[]>([])
  const [partnerGoals, setPartnerGoals] = useState<Goal[]>([])
  const [partner, setPartner] = useState<Profile | null>(null)
  const [logsByGoal, setLogsByGoal] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [editingGoal, setEditingGoal] = useState<Goal | 'new' | null>(null)

  const today = profile ? todayInTimezone(profile.timezone) : new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [{ data: mine }, { data: theirs }] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('owner_id', profile.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('goals')
        .select('*')
        .neq('owner_id', profile.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])

    setMyGoals((mine as Goal[]) ?? [])
    setPartnerGoals((theirs as Goal[]) ?? [])

    if (theirs && theirs.length > 0) {
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', theirs[0].owner_id)
        .maybeSingle()
      setPartner((partnerProfile as Profile) ?? null)
    }

    const goalIds = [...(mine ?? []), ...(theirs ?? [])].map((g) => g.id)
    if (goalIds.length > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - STREAK_LOOKBACK_DAYS)
      const { data: logs } = await supabase
        .from('goal_logs')
        .select('*')
        .in('goal_id', goalIds)
        .gte('log_date', cutoff.toISOString().slice(0, 10))

      const map = new Map<string, Set<string>>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        if (!log.completed) continue
        if (!map.has(log.goal_id)) map.set(log.goal_id, new Set())
        map.get(log.goal_id)!.add(log.log_date)
      }
      setLogsByGoal(map)
    } else {
      setLogsByGoal(new Map())
    }

    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || !coupleId) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Goals</h1>
        <button
          type="button"
          onClick={() => setEditingGoal('new')}
          className="min-h-11 rounded-full bg-mine px-4 py-2 font-medium text-bg"
        >
          + Add goal
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-ink-dim">Loading…</p>
      ) : myGoals.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-ink">No goals yet</p>
          <p className="mt-1 text-sm text-ink-dim">
            Add your first one — a daily habit, a counter like glasses of
            water, whatever you want to build.
          </p>
          <button
            type="button"
            onClick={() => setEditingGoal('new')}
            className="mt-4 min-h-11 rounded-xl bg-mine px-4 py-2 font-medium text-bg"
          >
            + Add goal
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {myGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              today={today}
              completedDates={logsByGoal.get(goal.id) ?? new Set()}
              onClick={() => setEditingGoal(goal)}
            />
          ))}
        </div>
      )}

      {partnerGoals.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-ink-dim">
            {partner?.display_name ?? 'Her'}'s shared goals
          </h2>
          <div className="mt-3 space-y-3">
            {partnerGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                today={today}
                completedDates={logsByGoal.get(goal.id) ?? new Set()}
                readOnly
              />
            ))}
          </div>
        </div>
      )}

      {editingGoal && (
        <GoalFormSheet
          goal={editingGoal === 'new' ? undefined : editingGoal}
          onClose={() => setEditingGoal(null)}
          onSaved={() => {
            setEditingGoal(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function GoalCard({
  goal,
  today,
  completedDates,
  readOnly,
  onClick,
}: {
  goal: Goal
  today: string
  completedDates: Set<string>
  readOnly?: boolean
  onClick?: () => void
}) {
  const streak = currentStreak(completedDates, today)
  const week = lastSevenDays(completedDates, today)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      className={`w-full rounded-2xl border bg-surface p-4 text-left ${readOnly ? '' : 'active:scale-[0.99]'}`}
      style={{ borderColor: `${goal.color}40` }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ backgroundColor: `${goal.color}26` }}
        >
          {goal.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{goal.title}</p>
          <p className="text-xs text-ink-dim">
            {goal.kind === 'counter' ? `${goal.target_per_day} ${goal.unit ?? ''}/day` : goal.difficulty}
            {streak > 0 && ` · 🔥 ${streak} day${streak === 1 ? '' : 's'}`}
          </p>
        </div>
        {!readOnly && <span className="text-ink-dim">›</span>}
      </div>

      <div className="mt-3 flex gap-1">
        {week.map((d) => (
          <span
            key={d.date}
            className="h-2 flex-1 rounded-full"
            style={{
              backgroundColor: d.done ? goal.color : 'var(--color-border)',
            }}
          />
        ))}
      </div>
    </button>
  )
}
