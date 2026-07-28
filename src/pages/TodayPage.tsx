import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ensureTodaysTasks } from '../lib/recurrence'
import { timeOfDayLabel } from '../lib/date'
import { levelProgress } from '../lib/levels'
import { haptic } from '../lib/motion'
import { Confetti } from '../components/Confetti'
import { AnimatedCheck } from '../components/AnimatedCheck'
import { ProgressRing } from '../components/ProgressRing'
import { NudgeComposer } from '../components/NudgeComposer'
import { notifyPartner } from '../lib/push'
import { currentStreak, shiftDate } from '../lib/streak'
import { quoteForDate, daysTogether } from '../lib/quotes'
import type { Goal, GoalLog, Profile, Task, TimeOfDay } from '../lib/types'

const TIME_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'any']

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// Extracted so a task looks identical whether it sits under a goal or in a
// plain time-of-day list. Inside a goal group the goal's emoji is already on
// the header, so it's dropped from the row.
function TaskRow({
  task,
  goal,
  celebrating,
  flashPoints,
  expanded,
  onToggle,
  onToggleNotes,
}: {
  task: Task
  goal?: Goal
  celebrating: boolean
  flashPoints: number | null
  expanded: boolean
  onToggle: () => void
  onToggleNotes: () => void
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
          task.done ? 'border-mine/30 bg-mine/10' : 'border-border bg-surface'
        }`}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          {celebrating && (
            <span className="animate-ring-burst absolute inset-0 rounded-full border-2 border-mine" />
          )}
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-bg ${
              task.done ? 'border-mine bg-mine' : 'border-border'
            } ${celebrating ? 'animate-check-bounce' : ''}`}
          >
            <AnimatedCheck done={task.done} celebrating={celebrating} />
          </span>
        </span>
        {goal && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
            style={{ backgroundColor: `${goal.color}26` }}
          >
            {goal.emoji}
          </span>
        )}
        <span
          className={`flex-1 transition-colors duration-300 ${task.done ? 'text-ink-dim' : 'text-ink'}`}
        >
          <span
            className={`strike-wrap ${task.done ? 'is-struck' : ''} ${
              celebrating ? 'is-animating' : ''
            }`}
          >
            {task.title}
          </span>
        </span>
        {task.notes && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Show details"
            onClick={(e) => {
              e.stopPropagation()
              onToggleNotes()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onToggleNotes()
              }
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-dim"
          >
            {expanded ? '▴' : '▾'}
          </span>
        )}
        {celebrating && <Confetti />}
      </button>

      {task.notes && expanded && (
        <p className="mt-1 whitespace-pre-line rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink-dim">
          {task.notes}
        </p>
      )}
      {flashPoints !== null && (
        <span className="pointer-events-none absolute -top-2 right-2 animate-bounce text-sm font-semibold text-mine">
          +{flashPoints}
        </span>
      )}
    </div>
  )
}

export function TodayPage() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [today, setToday] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [myGoals, setMyGoals] = useState<Goal[]>([])
  const [goalLogs, setGoalLogs] = useState<Map<string, GoalLog>>(new Map())
  const [scheduledGoalIds, setScheduledGoalIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<Profile | null>(null)
  const [partnerDone, setPartnerDone] = useState(0)
  const [partnerTotal, setPartnerTotal] = useState(0)
  const [flash, setFlash] = useState<{ id: string; points: number } | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [editingCount, setEditingCount] = useState<string | null>(null)
  const [editingCountValue, setEditingCountValue] = useState('')
  const [nudging, setNudging] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [goalsById, setGoalsById] = useState<Map<string, Goal>>(new Map())
  const [togetherSince, setTogetherSince] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const day = await ensureTodaysTasks(profile.id, profile.timezone)
    setToday(day)

    // All my goals: counters render inline, and the rest supply the emoji
    // shown against each task.
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    const allGoals = (goals as Goal[]) ?? []
    const byId = new Map(allGoals.map((g) => [g.id, g]))
    setGoalsById(byId)
    setMyGoals(allGoals)

    const { data: todaysTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('task_date', day)
      .order('created_at', { ascending: true })

    // Drop outstanding tasks belonging to a goal that's been archived. Archive
    // now clears these itself, but goals archived before that did leave tasks
    // stranded here: no emoji, nothing to complete them for, still counted in
    // the day's total. Anything already ticked stays, since it earned points.
    setTasks(
      ((todaysTasks as Task[]) ?? []).filter(
        (t) => t.done || !t.goal_id || byId.has(t.goal_id),
      ),
    )

    // Goals that a recurring template already schedules. Those appear as
    // tasks on the days they're due, so they must NOT also appear as a
    // standalone row on the days they aren't: a Mon/Wed/Fri habit showing up
    // every day would quietly undo the schedule you set.
    const { data: templates } = await supabase
      .from('task_templates')
      .select('goal_id')
      .eq('owner_id', profile.id)
      .eq('is_active', true)
      .not('goal_id', 'is', null)
    setScheduledGoalIds(
      new Set(((templates as { goal_id: string }[] | null) ?? []).map((t) => t.goal_id)),
    )

    // Today's log for every goal, not just counters: checkbox goals without a
    // task template are now tickable here too, so they need their state.
    if (allGoals.length > 0) {
      const { data: logs } = await supabase
        .from('goal_logs')
        .select('*')
        .in(
          'goal_id',
          allGoals.map((g) => g.id),
        )
        .eq('log_date', day)
      const map = new Map<string, GoalLog>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        map.set(log.goal_id, log)
      }
      setGoalLogs(map)
    } else {
      setGoalLogs(new Map())
    }

    // Partner strip. Driven by the pairing itself, NOT by whether she has
    // shared any goals — otherwise you couldn't nudge a partner who simply
    // keeps all their goals private.
    const { data: membership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (membership) {
      const [{ data: partnerMember }, { data: couple }] = await Promise.all([
        supabase
          .from('couple_members')
          .select('profiles(*)')
          .eq('couple_id', membership.couple_id)
          .neq('profile_id', profile.id)
          .maybeSingle(),
        supabase
          .from('couples')
          .select('together_since')
          .eq('id', membership.couple_id)
          .maybeSingle(),
      ])
      setPartner((partnerMember?.profiles as unknown as Profile) ?? null)
      setTogetherSince((couple?.together_since as string | null) ?? null)
    } else {
      setPartner(null)
      setTogetherSince(null)
    }

    // Her shared-goal progress for today. RLS already limits this to goals
    // she explicitly marked shared, so private ones never surface here.
    const { data: sharedGoals } = await supabase
      .from('goals')
      .select('id')
      .neq('owner_id', profile.id)
      .eq('is_active', true)
    const shared = (sharedGoals as { id: string }[]) ?? []

    if (shared.length > 0) {
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
      setPartnerDone(0)
      setPartnerTotal(0)
    }

    setLoading(false)
    // Depend on the specific fields used, not the profile object: completing
    // a task calls refreshProfile(), which hands back a new object reference
    // every time, and that would re-run this whole day load on every tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.timezone])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleTask(task: Task) {
    const nextDone = !task.done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)))

    if (nextDone) {
      haptic('done')
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

    // If this goal has a same-named placeholder task standing in for the goal
    // itself, it's hidden behind the group header, so nothing would ever tick
    // it by hand. Bring it along with its siblings, or the goal can never
    // complete.
    if (task.goal_id) {
      await syncParentTask(
        task.goal_id,
        tasks.map((t) => (t.id === task.id ? (updated as Task) : t)),
      )
    }

    // The parent goal is crossed off by a database trigger, and only once
    // EVERY task linked to it that day is done — one set of squats doesn't
    // finish "get stronger". So read back what the trigger decided rather
    // than assuming this tick completed the goal.
    if (task.goal_id && nextDone) {
      const { data: log } = await supabase
        .from('goal_logs')
        .select('completed')
        .eq('goal_id', task.goal_id)
        .eq('log_date', today)
        .maybeSingle()

      if ((log as { completed: boolean } | null)?.completed) {
        void announceGoalProgress(task.goal_id)
      }
    }

    // Pull the server-updated points_total/current_level so the level bar
    // in the header moves as you complete things.
    await refreshProfile()
  }

  // Keeps the hidden placeholder task in step with the ones shown under it.
  // Only touches a task whose title matches its goal's, which is the one the
  // group header is standing in for.
  async function syncParentTask(goalId: string, snapshot: Task[]) {
    const goal = goalsById.get(goalId)
    if (!goal) return

    const group = snapshot.filter((t) => t.goal_id === goalId)
    const parent = group.find((t) => sameName(t.title, goal.title))
    if (!parent) return

    const children = group.filter((t) => t.id !== parent.id)
    if (children.length === 0) return

    const shouldBeDone = children.every((t) => t.done)
    if (shouldBeDone === parent.done) return

    const { data } = await supabase
      .from('tasks')
      .update({ done: shouldBeDone })
      .eq('id', parent.id)
      .select()
      .single()

    if (data) {
      setTasks((prev) => prev.map((t) => (t.id === parent.id ? (data as Task) : t)))
    }
  }

  // Tells the partner about a completion. The endpoint re-checks that the
  // goal is actually shared, so nothing private leaks if this is called for
  // a private goal.
  async function announceGoalProgress(goalId: string) {
    const { data: logs } = await supabase
      .from('goal_logs')
      .select('log_date, completed')
      .eq('goal_id', goalId)
      .gte('log_date', shiftDate(today, -60))

    const completedDates = new Set(
      ((logs as { log_date: string; completed: boolean }[] | null) ?? [])
        .filter((l) => l.completed)
        .map((l) => l.log_date),
    )
    const streak = currentStreak(completedDates, today)

    if (streak > 0 && streak % 7 === 0) {
      notifyPartner({ kind: 'streak_milestone', goal_id: goalId, streak })
    } else {
      notifyPartner({ kind: 'goal_completed', goal_id: goalId })
    }
  }

  async function commitCounter(goal: Goal, nextCount: number) {
    const existing = goalLogs.get(goal.id)
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
    setGoalLogs((prev) => new Map(prev).set(goal.id, optimistic))

    if (justHitTarget) {
      haptic('celebrate')
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

    setGoalLogs((prev) => new Map(prev).set(goal.id, updated as GoalLog))

    const prevPoints = existing?.points_awarded ?? 0
    const newPoints = (updated as GoalLog).points_awarded
    if (newPoints > prevPoints) {
      setFlash({ id: goal.id, points: newPoints - prevPoints })
      setTimeout(() => setFlash(null), 1200)
    }

    if (justHitTarget) {
      void announceGoalProgress(goal.id)
    }

    await refreshProfile()
  }

  // Checkbox goals with no task behind them. Writing goal_logs directly is
  // safe here precisely because there are no linked tasks: the tasks trigger
  // only takes over a day that actually has some.
  async function toggleGoal(goal: Goal) {
    const existing = goalLogs.get(goal.id)
    const nextCompleted = !(existing?.completed ?? false)

    setGoalLogs((prev) =>
      new Map(prev).set(goal.id, {
        id: existing?.id ?? 'pending',
        goal_id: goal.id,
        owner_id: profile!.id,
        log_date: today,
        count: nextCompleted ? 1 : 0,
        completed: nextCompleted,
        points_awarded: existing?.points_awarded ?? 0,
        created_at: existing?.created_at ?? new Date().toISOString(),
      }),
    )

    if (nextCompleted) {
      haptic('done')
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
          completed: nextCompleted,
          count: nextCompleted ? 1 : 0,
        },
        { onConflict: 'goal_id,log_date' },
      )
      .select()
      .single()

    if (error || !updated) {
      // Put the old state back rather than leaving a tick that didn't save.
      setGoalLogs((prev) => {
        const next = new Map(prev)
        if (existing) next.set(goal.id, existing)
        else next.delete(goal.id)
        return next
      })
      return
    }

    setGoalLogs((prev) => new Map(prev).set(goal.id, updated as GoalLog))

    const gained = (updated as GoalLog).points_awarded - (existing?.points_awarded ?? 0)
    if (gained > 0) {
      setFlash({ id: goal.id, points: gained })
      setTimeout(() => setFlash(null), 1200)
    }

    if (nextCompleted) void announceGoalProgress(goal.id)
    await refreshProfile()
  }

  async function adjustCounter(goal: Goal, delta: number) {
    if (delta > 0) haptic('tick')
    const existing = goalLogs.get(goal.id)
    await commitCounter(goal, (existing?.count ?? 0) + delta)
  }

  function startEditingCount(goal: Goal) {
    const existing = goalLogs.get(goal.id)
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
    [...goalLogs.values()].reduce((sum, l) => sum + l.points_awarded, 0)

  const counterGoals = myGoals.filter((g) => g.kind === 'counter')

  // Checkbox goals with nothing scheduling them. These used to be invisible
  // here, tickable only by opening the year grid from the Goals screen, which
  // meant "today" wasn't actually the whole of today.
  const goalIdsWithTasks = new Set(tasks.map((t) => t.goal_id).filter(Boolean))
  const standaloneGoals = myGoals.filter(
    (g) =>
      g.kind === 'checkbox' && !goalIdsWithTasks.has(g.id) && !scheduledGoalIds.has(g.id),
  )

  // Goals that today splits into several tasks. Those tasks come out of the
  // time-of-day lists and sit under their goal instead, so a goal the planner
  // spread across the afternoon and "anytime" reads as one thing with parts
  // rather than as unrelated rows in different sections.
  const tasksByGoal = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.goal_id) continue
    const list = tasksByGoal.get(task.goal_id)
    if (list) list.push(task)
    else tasksByGoal.set(task.goal_id, [task])
  }

  const goalGroups = [...tasksByGoal.entries()]
    .map(([goalId, items]) => {
      const goal = goalsById.get(goalId)
      // A goal whose own template makes a task with the same name as the goal
      // ("Workout" inside "Workout") would otherwise show up twice: once as
      // the group header, once as a row under it. Treat that task as the
      // header's own record and don't render it separately.
      const parent = goal ? items.find((t) => sameName(t.title, goal.title)) : undefined
      const children = parent ? items.filter((t) => t.id !== parent.id) : items
      return { goal, parent, children, items }
    })
    .filter(
      (entry): entry is {
        goal: Goal
        parent: Task | undefined
        children: Task[]
        items: Task[]
      } => entry.goal?.kind === 'checkbox' && entry.items.length > 1 && entry.children.length > 0,
    )

  const groupedTaskIds = new Set(goalGroups.flatMap((g) => g.items.map((t) => t.id)))

  const grouped = TIME_ORDER.map((tod) => ({
    tod,
    items: tasks.filter((t) => t.time_of_day === tod && !groupedTaskIds.has(t.id)),
  })).filter((g) => g.items.length > 0)

  // One number for the whole day. A goal with several tasks counts as ONE
  // thing, not as its parts, so the ring matches what the screen shows.
  const dayTotal =
    tasks.length - groupedTaskIds.size +
    goalGroups.length +
    counterGoals.length +
    standaloneGoals.length
  const dayDone =
    tasks.filter((t) => t.done && !groupedTaskIds.has(t.id)).length +
    goalGroups.filter((g) => g.items.every((t) => t.done)).length +
    counterGoals.filter((g) => goalLogs.get(g.id)?.completed).length +
    standaloneGoals.filter((g) => goalLogs.get(g.id)?.completed).length
  const dayFraction = dayTotal === 0 ? 0 : dayDone / dayTotal

  const hasNothing = dayTotal === 0

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-dim">
            {new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <h1 className="mt-0.5 text-3xl font-semibold text-ink">
            {dayTotal === 0 ? (
              'Today'
            ) : dayDone === dayTotal ? (
              'All done'
            ) : (
              <>
                <span className="tabular">{dayDone}</span>
                <span className="text-ink-dim"> of </span>
                <span className="tabular">{dayTotal}</span>
              </>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            <span className="tabular text-mine">{pointsToday}</span> points today
          </p>
        </div>

        {/* One focal point for the screen. The ring is the day; the level chip
            underneath is the long game. */}
        <button
          type="button"
          onClick={() => navigate('/points')}
          className="shrink-0 transition-transform active:scale-95"
          aria-label={`Level ${profile.current_level}. View points`}
        >
          <ProgressRing progress={dayFraction} color="var(--color-mine)" size={78} strokeWidth={5}>
            <span className="text-center">
              <span className="block text-[9px] uppercase tracking-wider text-ink-dim">Level</span>
              <span className="tabular block text-2xl font-bold leading-none text-mine">
                {profile.current_level}
              </span>
            </span>
          </ProgressRing>
          <div className="mx-auto mt-1.5 h-1 w-12 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-mine transition-all duration-500"
              style={{
                width: `${levelProgress(profile.points_total, profile.current_level).fraction * 100}%`,
              }}
            />
          </div>
        </button>
      </div>

      {partner && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-partner/20 bg-surface p-3">
          <button
            type="button"
            onClick={() => navigate('/partner')}
            className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]"
          >
            <span className="text-xl">{partner.avatar_emoji}</span>
            <p className="min-w-0 flex-1 truncate text-sm text-ink">
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
          <button
            type="button"
            onClick={() => setNudging(true)}
            className="min-h-11 shrink-0 rounded-full bg-partner px-3 py-2 text-sm font-medium text-bg"
          >
            Nudge
          </button>
        </div>
      )}

      {nudging && partner && (
        <NudgeComposer partner={partner} onClose={() => setNudging(false)} />
      )}

      {/* Days together + a quote that rotates once a day (deterministic on
          the date, so you both see the same one). */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
        {togetherSince && (
          <div className="flex items-center justify-center gap-2 border-b border-border bg-partner/10 px-4 py-2.5">
            <span className="text-sm">💞</span>
            <p className="text-sm text-ink">
              <span className="font-semibold">{daysTogether(togetherSince, today)}</span>
              <span className="text-ink-dim"> days together</span>
            </p>
          </div>
        )}
        <p className="px-4 py-3 text-center text-sm italic leading-relaxed text-ink-dim">
          {quoteForDate(today)}
        </p>
      </div>

      {counterGoals.length > 0 && (
        <div className="mt-6 space-y-2">
          {counterGoals.map((goal) => {
            const log = goalLogs.get(goal.id)
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
                  <ProgressRing progress={count / target} color={goal.color} size={52}>
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
                  </ProgressRing>
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

      {standaloneGoals.length > 0 && (
        <div className="mt-6 space-y-2">
          {standaloneGoals.map((goal) => {
            const done = goalLogs.get(goal.id)?.completed ?? false
            return (
              <div key={goal.id} className="relative">
                <button
                  type="button"
                  onClick={() => void toggleGoal(goal)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors active:scale-[0.995]"
                  style={{
                    borderColor: done ? goal.color : 'var(--color-border)',
                    backgroundColor: done ? `${goal.color}14` : 'var(--color-surface)',
                  }}
                >
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                    {celebrating === goal.id && (
                      <span
                        className="animate-ring-burst absolute inset-0 rounded-full border-2"
                        style={{ borderColor: goal.color }}
                      />
                    )}
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-bg ${
                        celebrating === goal.id ? 'animate-check-bounce' : ''
                      }`}
                      style={{
                        borderColor: done ? goal.color : 'var(--color-border)',
                        backgroundColor: done ? goal.color : 'transparent',
                      }}
                    >
                      <AnimatedCheck done={done} celebrating={celebrating === goal.id} />
                    </span>
                  </span>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: `${goal.color}26` }}
                  >
                    {goal.emoji}
                  </span>
                  <span
                    className={`flex-1 transition-colors duration-300 ${done ? 'text-ink-dim' : 'text-ink'}`}
                  >
                    <span
                      className={`strike-wrap ${done ? 'is-struck' : ''} ${
                        celebrating === goal.id ? 'is-animating' : ''
                      }`}
                    >
                      {goal.title}
                    </span>
                  </span>
                  {celebrating === goal.id && <Confetti />}
                </button>
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

      {/* A goal that today splits into several tasks gets its own row with
          the tasks nested under it. The goal's own checkbox is derived, not
          tappable: it ticks itself the moment the last task under it is
          done, which is the whole point. */}
      {goalGroups.map(({ goal, children }) => {
        const doneCount = children.filter((t) => t.done).length
        const complete = doneCount === children.length
        return (
          <div key={goal.id} className="mt-6">
            <div
              className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors"
              style={{
                borderColor: complete ? goal.color : 'var(--color-border)',
                backgroundColor: complete ? `${goal.color}14` : 'var(--color-surface)',
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-bg"
                style={{
                  borderColor: complete ? goal.color : 'var(--color-border)',
                  backgroundColor: complete ? goal.color : 'transparent',
                }}
              >
                <AnimatedCheck done={complete} celebrating={false} />
              </span>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                style={{ backgroundColor: `${goal.color}26` }}
              >
                {goal.emoji}
              </span>
              <span className={`flex-1 font-medium ${complete ? 'text-ink-dim' : 'text-ink'}`}>
                <span className={`strike-wrap ${complete ? 'is-struck' : ''}`}>{goal.title}</span>
              </span>
              <span
                className="tabular shrink-0 text-sm font-medium"
                style={{ color: complete ? goal.color : 'var(--color-ink-dim)' }}
              >
                {doneCount}/{children.length}
              </span>
            </div>

            {/* Indented and hung off a rule so the nesting is obvious. */}
            <div
              className="mt-2 space-y-2 border-l pl-3"
              style={{ borderColor: `${goal.color}40`, marginLeft: '1.25rem' }}
            >
              {children.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  celebrating={celebrating === task.id}
                  flashPoints={flash?.id === task.id ? flash.points : null}
                  expanded={expandedTask === task.id}
                  onToggle={() => void toggleTask(task)}
                  onToggleNotes={() =>
                    setExpandedTask((prev) => (prev === task.id ? null : task.id))
                  }
                />
              ))}
            </div>
          </div>
        )
      })}

      {grouped.map((group) => (
        <div key={group.tod} className="mt-6">
          <h2 className="text-sm font-medium text-ink-dim">{timeOfDayLabel(group.tod)}</h2>
          <div className="mt-2 space-y-2">
            {group.items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                goal={task.goal_id ? goalsById.get(task.goal_id) : undefined}
                celebrating={celebrating === task.id}
                flashPoints={flash?.id === task.id ? flash.points : null}
                expanded={expandedTask === task.id}
                onToggle={() => void toggleTask(task)}
                onToggleNotes={() => setExpandedTask((prev) => (prev === task.id ? null : task.id))}
              />
            ))}
          </div>
        </div>
      ))}

      {hasNothing && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-ink">Nothing set up yet</p>
          <p className="mt-1 text-sm text-ink-dim">
            Add a goal and it shows up here every day, ready to tick off.
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
