import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ensureTodaysTasks } from '../lib/recurrence'
import { timeOfDayLabel } from '../lib/date'
import { InstallStatus } from '../components/InstallStatus'
import { Confetti } from '../components/Confetti'
import { AnimatedCheck } from '../components/AnimatedCheck'
import type { Goal, GoalLog, Profile, Task, TimeOfDay } from '../lib/types'

const TIME_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'any']

export function TodayPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [today, setToday] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [counterGoals, setCounterGoals] = useState<Goal[]>([])
  const [counterLogs, setCounterLogs] = useState<Map<string, GoalLog>>(new Map())
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<Profile | null>(null)
  const [partnerDone, setPartnerDone] = useState(0)
  const [partnerTotal, setPartnerTotal] = useState(0)
  const [flash, setFlash] = useState<{ id: string; points: number } | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [editingCount, setEditingCount] = useState<string | null>(null)
  const [editingCountValue, setEditingCountValue] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const day = await ensureTodaysTasks(profile.id, profile.timezone)
    setToday(day)

    const { data: todaysTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('task_date', day)
      .order('created_at', { ascending: true })
    setTasks((todaysTasks as Task[]) ?? [])

    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('is_active', true)
      .eq('kind', 'counter')
      .order('sort_order', { ascending: true })
    const counters = (goals as Goal[]) ?? []
    setCounterGoals(counters)

    if (counters.length > 0) {
      const { data: logs } = await supabase
        .from('goal_logs')
        .select('*')
        .in(
          'goal_id',
          counters.map((g) => g.id),
        )
        .eq('log_date', day)
      const map = new Map<string, GoalLog>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        map.set(log.goal_id, log)
      }
      setCounterLogs(map)
    } else {
      setCounterLogs(new Map())
    }

    // Partner strip: her shared goals + today's completions. RLS already
    // limits this to goals she's explicitly marked shared.
    const { data: sharedGoals } = await supabase
      .from('goals')
      .select('*')
      .neq('owner_id', profile.id)
      .eq('is_active', true)
    const shared = (sharedGoals as Goal[]) ?? []
    if (shared.length > 0) {
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', shared[0].owner_id)
        .maybeSingle()
      setPartner((partnerProfile as Profile) ?? null)

      const { data: sharedLogs } = await supabase
        .from('goal_logs')
        .select('*')
        .in(
          'goal_id',
          shared.map((g) => g.id),
        )
        .eq('log_date', day)
      const doneCount = ((sharedLogs as GoalLog[] | null) ?? []).filter((l) => l.completed).length
      setPartnerDone(doneCount)
      setPartnerTotal(shared.length)
    } else {
      setPartner(null)
    }

    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleTask(task: Task) {
    const nextDone = !task.done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)))

    if (nextDone) {
      if (navigator.vibrate) navigator.vibrate(15)
      setCelebrating(task.id)
      setTimeout(() => setCelebrating(null), 650)
    }

    const { data: updated, error } = await supabase
      .from('tasks')
      .update({ done: nextDone })
      .eq('id', task.id)
      .select()
      .single()

    if (error || !updated) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? (updated as Task) : t)))

    if (nextDone && (updated as Task).points_awarded > 0) {
      setFlash({ id: task.id, points: (updated as Task).points_awarded })
      setTimeout(() => setFlash(null), 1200)
    }

    // Mirror completion into goal_logs for the year grid (Phase 4), without
    // double-awarding points — the checkbox goal_logs trigger always sets
    // points_awarded to 0 since the task above is the real scoring event.
    if (task.goal_id) {
      await supabase.from('goal_logs').upsert(
        {
          goal_id: task.goal_id,
          owner_id: profile!.id,
          log_date: today,
          completed: nextDone,
          count: nextDone ? 1 : 0,
        },
        { onConflict: 'goal_id,log_date' },
      )
    }
  }

  async function commitCounter(goal: Goal, nextCount: number) {
    const existing = counterLogs.get(goal.id)
    const clamped = Math.max(0, nextCount)
    const target = goal.target_per_day ?? 1
    const nextCompleted = clamped >= target
    const justHitTarget = nextCompleted && !(existing?.completed ?? false)

    const optimistic: GoalLog = {
      id: existing?.id ?? 'pending',
      goal_id: goal.id,
      owner_id: profile!.id,
      log_date: today,
      count: clamped,
      completed: nextCompleted,
      points_awarded: existing?.points_awarded ?? 0,
      created_at: existing?.created_at ?? new Date().toISOString(),
    }
    setCounterLogs((prev) => new Map(prev).set(goal.id, optimistic))

    if (justHitTarget) {
      setCelebrating(goal.id)
      setTimeout(() => setCelebrating(null), 650)
    }

    const { data: updated, error } = await supabase
      .from('goal_logs')
      .upsert(
        {
          goal_id: goal.id,
          owner_id: profile!.id,
          log_date: today,
          count: clamped,
          completed: nextCompleted,
        },
        { onConflict: 'goal_id,log_date' },
      )
      .select()
      .single()

    if (error || !updated) return

    setCounterLogs((prev) => new Map(prev).set(goal.id, updated as GoalLog))

    const prevPoints = existing?.points_awarded ?? 0
    const newPoints = (updated as GoalLog).points_awarded
    if (newPoints > prevPoints) {
      setFlash({ id: goal.id, points: newPoints - prevPoints })
      setTimeout(() => setFlash(null), 1200)
    }
  }

  async function adjustCounter(goal: Goal, delta: number) {
    if (delta > 0 && navigator.vibrate) navigator.vibrate(10)
    const existing = counterLogs.get(goal.id)
    await commitCounter(goal, (existing?.count ?? 0) + delta)
  }

  function startEditingCount(goal: Goal) {
    const existing = counterLogs.get(goal.id)
    setEditingCount(goal.id)
    setEditingCountValue((existing?.count ?? 0).toString())
  }

  async function commitEditingCount(goal: Goal) {
    const value = Number(editingCountValue)
    setEditingCount(null)
    if (Number.isFinite(value)) {
      await commitCounter(goal, Math.round(value))
    }
  }

  const pointsToday =
    tasks.filter((t) => t.done).reduce((sum, t) => sum + t.points_awarded, 0) +
    [...counterLogs.values()].reduce((sum, l) => sum + l.points_awarded, 0)

  const grouped = TIME_ORDER.map((tod) => ({
    tod,
    items: tasks.filter((t) => t.time_of_day === tod),
  })).filter((g) => g.items.length > 0)

  const hasNothing = tasks.length === 0 && counterGoals.length === 0

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h1>
          <p className="mt-1 text-mine">{pointsToday} points today</p>
        </div>
      </div>

      {partner && (
        <button
          type="button"
          onClick={() => navigate('/partner')}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-partner/20 bg-surface p-3 text-left active:scale-[0.99]"
        >
          <span className="text-xl">{partner.avatar_emoji}</span>
          <p className="flex-1 text-sm text-ink">
            <span className="font-medium">{partner.display_name}</span>
            {partnerTotal > 0 && (
              <span className="text-ink-dim">
                {' '}
                · {partnerDone}/{partnerTotal} shared goals today
              </span>
            )}
          </p>
          <span className="text-ink-dim">›</span>
        </button>
      )}

      <div className="mt-4">
        <InstallStatus />
      </div>

      {counterGoals.length > 0 && (
        <div className="mt-6 space-y-2">
          {counterGoals.map((goal) => {
            const log = counterLogs.get(goal.id)
            const count = log?.count ?? 0
            const target = goal.target_per_day ?? 1
            return (
              <div
                key={goal.id}
                className="relative flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
                  style={{ backgroundColor: `${goal.color}26` }}
                >
                  {goal.emoji}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-ink">{goal.title}</p>
                  {editingCount === goal.id ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={editingCountValue}
                        onChange={(e) => setEditingCountValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitEditingCount(goal)
                          }
                        }}
                        onBlur={() => void commitEditingCount(goal)}
                        className="h-9 w-20 rounded-lg border border-border bg-surface-raised px-2 text-base text-ink focus:border-mine focus:outline-none"
                      />
                      <span className="text-sm text-ink-dim">/ {target} {goal.unit ?? ''}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditingCount(goal)}
                      className="text-sm text-ink-dim underline decoration-dotted underline-offset-2"
                    >
                      {count} / {target} {goal.unit ?? ''}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void adjustCounter(goal, -1)}
                  disabled={count === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-dim disabled:opacity-40"
                >
                  −
                </button>
                <span className="relative">
                  {celebrating === goal.id && (
                    <span
                      className="animate-ring-burst absolute inset-0 rounded-full border-2"
                      style={{ borderColor: goal.color }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void adjustCounter(goal, 1)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full font-semibold text-bg ${
                      celebrating === goal.id ? 'animate-check-bounce' : ''
                    }`}
                    style={{ backgroundColor: goal.color }}
                  >
                    +1
                  </button>
                </span>
                {celebrating === goal.id && <Confetti />}
                {flash?.id === goal.id && (
                  <span className="pointer-events-none absolute -top-2 right-2 animate-bounce text-sm font-semibold text-mine">
                    +{flash.points}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.tod} className="mt-6">
          <h2 className="text-sm font-medium text-ink-dim">{timeOfDayLabel(group.tod)}</h2>
          <div className="mt-2 space-y-2">
            {group.items.map((task) => (
              <div key={task.id} className="relative">
                <button
                  type="button"
                  onClick={() => void toggleTask(task)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    task.done ? 'border-mine/30 bg-mine/10' : 'border-border bg-surface'
                  }`}
                >
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                    {celebrating === task.id && (
                      <span className="animate-ring-burst absolute inset-0 rounded-full border-2 border-mine" />
                    )}
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-bg ${
                        task.done ? 'border-mine bg-mine' : 'border-border'
                      } ${celebrating === task.id ? 'animate-check-bounce' : ''}`}
                    >
                      <AnimatedCheck done={task.done} celebrating={celebrating === task.id} />
                    </span>
                  </span>
                  <span
                    className={`flex-1 transition-colors duration-300 ${task.done ? 'text-ink-dim' : 'text-ink'}`}
                  >
                    <span
                      className={`strike-wrap ${task.done ? 'is-struck' : ''} ${
                        celebrating === task.id ? 'is-animating' : ''
                      }`}
                    >
                      {task.title}
                    </span>
                  </span>
                  {celebrating === task.id && <Confetti />}
                </button>
                {flash?.id === task.id && (
                  <span className="pointer-events-none absolute -top-2 right-2 animate-bounce text-sm font-semibold text-mine">
                    +{flash.points}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {hasNothing && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-ink">Nothing set up yet</p>
          <p className="mt-1 text-sm text-ink-dim">
            Add a goal and it'll show up here every day.
          </p>
          <button
            type="button"
            onClick={() => navigate('/goals')}
            className="mt-4 min-h-11 rounded-xl bg-mine px-4 py-2 font-medium text-bg"
          >
            Go to Goals
          </button>
        </div>
      )}
    </div>
  )
}
