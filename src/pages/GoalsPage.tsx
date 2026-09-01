import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkle } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { todayInTimezone } from '../lib/date'
import { currentStreak, lastSevenDayFractions } from '../lib/streak'
import { GoalFormSheet } from '../components/GoalFormSheet'
import { YearGridModal } from '../components/YearGridModal'
import { BenchmarkFormSheet } from '../components/BenchmarkFormSheet'
import { BenchmarkDetailModal } from '../components/BenchmarkDetailModal'
import { SharedGoalCard } from '../components/SharedGoalCard'
import { SharedGoalFormSheet } from '../components/SharedGoalFormSheet'
import { PageHeader } from '../components/PageHeader'
import { benchmarkProgress, formatValue, isAchieved, remainingLabel } from '../lib/benchmarks'
import type {
  Benchmark,
  Goal,
  GoalLog,
  Profile,
  SharedGoal,
  SharedGoalEntry,
} from '../lib/types'

type Tab = 'mine' | 'ours' | 'theirs'

const STREAK_LOOKBACK_DAYS = 60

export function GoalsPage() {
  const { profile, coupleId } = useAuth()
  const [myGoals, setMyGoals] = useState<Goal[]>([])
  const [partnerGoals, setPartnerGoals] = useState<Goal[]>([])
  const [partner, setPartner] = useState<Profile | null>(null)
  const [logsByGoal, setLogsByGoal] = useState<Map<string, Map<string, GoalLog>>>(new Map())
  const [myBenchmarks, setMyBenchmarks] = useState<Benchmark[]>([])
  const [partnerBenchmarks, setPartnerBenchmarks] = useState<Benchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [editingGoal, setEditingGoal] = useState<Goal | 'new' | null>(null)
  const [viewingGoal, setViewingGoal] = useState<Goal | null>(null)
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | 'new' | null>(null)
  const [viewingBenchmark, setViewingBenchmark] = useState<Benchmark | null>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([])
  const [sharedEntries, setSharedEntries] = useState<SharedGoalEntry[]>([])
  const [editingShared, setEditingShared] = useState<SharedGoal | 'new' | null>(null)
  const navigate = useNavigate()

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

      // Keep the full log (not just completed dates) so counter goals can
      // render proportional week bars, not just done/not-done dots.
      const map = new Map<string, Map<string, GoalLog>>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        if (!map.has(log.goal_id)) map.set(log.goal_id, new Map())
        map.get(log.goal_id)!.set(log.log_date, log)
      }
      setLogsByGoal(map)
    } else {
      setLogsByGoal(new Map())
    }

    // RLS already limits the partner rows to benchmarks they marked shared.
    const { data: benchmarkRows } = await supabase
      .from('benchmarks')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    const allBenchmarks = (benchmarkRows as Benchmark[]) ?? []
    setMyBenchmarks(allBenchmarks.filter((b) => b.owner_id === profile.id))
    setPartnerBenchmarks(allBenchmarks.filter((b) => b.owner_id !== profile.id))

    // Shared goals belong to the couple, so RLS scopes these to your pairing
    // without needing a filter here.
    const { data: sharedRows } = await supabase
      .from('shared_goals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    const shared = (sharedRows as SharedGoal[]) ?? []
    setSharedGoals(shared)

    if (shared.length > 0) {
      const { data: entryRows } = await supabase
        .from('shared_goal_entries')
        .select('*')
        .in(
          'shared_goal_id',
          shared.map((g) => g.id),
        )
      setSharedEntries((entryRows as SharedGoalEntry[]) ?? [])
    } else {
      setSharedEntries([])
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || !coupleId) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  const partnerName = partner?.display_name ?? 'Her'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Goals" subtitle="Set them up here, tick them off on Today." />

      {/* Three focused views instead of one long scroll with four headings.
          Your habits, the things you're doing together, and hers were all
          stacked on one page; only one of them is ever what you came for. */}
      <div className="mt-4 flex gap-1 rounded-full border border-border p-1">
        {([
          { id: 'mine' as Tab, label: 'Mine' },
          { id: 'ours' as Tab, label: 'Ours' },
          { id: 'theirs' as Tab, label: partnerName },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-10 flex-1 truncate rounded-full px-3 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-mine text-bg' : 'text-ink-dim'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-ink-dim">Loading…</p>}

      {!loading && tab === 'mine' && (
        <>
          <SectionHeading
            title="Daily habits"
            hint="The things you do, tracked day by day."
            actionLabel="+ Add"
            onAction={() => setEditingGoal('new')}
          />

          {myGoals.length === 0 ? (
            <EmptyCard
              title="No habits yet"
              body="Add your first one: a daily habit, a counter like glasses of water, whatever you want to build."
              actionLabel="+ Add habit"
              onAction={() => setEditingGoal('new')}
            />
          ) : (
            <div className="mt-3 space-y-3">
              {myGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  today={today}
                  logs={logsByGoal.get(goal.id)}
                  onClick={() => setViewingGoal(goal)}
                  onEdit={() => setEditingGoal(goal)}
                />
              ))}
            </div>
          )}

          {/* The planner stopped being a tab. This is where you are when you
              want one, so this is where the button belongs. */}
          <button
            type="button"
            onClick={() => navigate('/planner')}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-mine/50 text-sm font-medium text-mine"
          >
            <Sparkle size={18} weight="fill" />
            Build me a plan
          </button>

          <SectionHeading
            title="Targets"
            hint="A number you're working toward, like a goal weight."
            actionLabel="+ Add"
            onAction={() => setEditingBenchmark('new')}
          />

          {myBenchmarks.length === 0 ? (
            <EmptyCard
              title="Nothing to chase yet"
              body="Set a target like a goal weight, a sub-7:30 mile, or a 225 bench, and log results as you go."
              actionLabel="+ Add target"
              onAction={() => setEditingBenchmark('new')}
            />
          ) : (
            <div className="mt-3 space-y-3">
              {myBenchmarks.map((b) => (
                <BenchmarkCard
                  key={b.id}
                  benchmark={b}
                  goals={myGoals}
                  onClick={() => setViewingBenchmark(b)}
                  onEdit={() => setEditingBenchmark(b)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'ours' && (
        <>
          <SectionHeading
            title="Together"
            hint="One target you both put into."
            actionLabel="+ Add"
            onAction={() => setEditingShared('new')}
          />

          {sharedGoals.length === 0 ? (
            <EmptyCard
              title="Nothing shared yet"
              body="Something you're both working on, like saving for a trip or twelve date nights this year. You each log what you add and it fills up together."
              actionLabel="+ Add shared goal"
              onAction={() => setEditingShared('new')}
            />
          ) : (
            <div className="mt-3 space-y-3">
              {sharedGoals.map((g) => (
                <SharedGoalCard
                  key={g.id}
                  goal={g}
                  entries={sharedEntries.filter((e) => e.shared_goal_id === g.id)}
                  partner={partner}
                  onChanged={() => void load()}
                  onEdit={() => setEditingShared(g)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'theirs' && (
        <>
          {partnerGoals.length === 0 && partnerBenchmarks.length === 0 ? (
            <EmptyCard
              title={`Nothing from ${partnerName} yet`}
              body="Only what she marks as shared shows up here. Anything private stays private."
            />
          ) : (
            <>
              {partnerGoals.length > 0 && (
                <>
                  <SectionHeading title="Daily habits" />
                  <div className="mt-3 space-y-3">
                    {partnerGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        today={today}
                        logs={logsByGoal.get(goal.id)}
                        readOnly
                        onClick={() => setViewingGoal(goal)}
                      />
                    ))}
                  </div>
                </>
              )}

              {partnerBenchmarks.length > 0 && (
                <>
                  <SectionHeading title="Targets" />
                  <div className="mt-3 space-y-3">
                    {partnerBenchmarks.map((b) => (
                      <BenchmarkCard
                        key={b.id}
                        benchmark={b}
                        goals={partnerGoals}
                        readOnly
                        onClick={() => setViewingBenchmark(b)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {editingShared && (
        <SharedGoalFormSheet
          goal={editingShared === 'new' ? undefined : editingShared}
          onClose={() => setEditingShared(null)}
          onSaved={() => {
            setEditingShared(null)
            void load()
          }}
        />
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

      {viewingGoal && (
        <YearGridModal
          goal={viewingGoal}
          readOnly={viewingGoal.owner_id !== profile.id}
          onClose={() => {
            setViewingGoal(null)
            void load()
          }}
        />
      )}

      {editingBenchmark && (
        <BenchmarkFormSheet
          benchmark={editingBenchmark === 'new' ? undefined : editingBenchmark}
          goals={myGoals}
          onClose={() => setEditingBenchmark(null)}
          onSaved={() => {
            setEditingBenchmark(null)
            void load()
          }}
        />
      )}

      {viewingBenchmark && (
        <BenchmarkDetailModal
          benchmark={viewingBenchmark}
          readOnly={viewingBenchmark.owner_id !== profile.id}
          onClose={() => {
            setViewingBenchmark(null)
            void load()
          }}
          onChanged={() => void load()}
        />
      )}
    </div>
  )
}

function SectionHeading({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mt-7 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-ink-dim">{hint}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-10 shrink-0 rounded-full border border-mine px-4 text-sm font-medium text-mine transition-transform active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function EmptyCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-dim">{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 min-h-11 rounded-xl bg-mine px-4 py-2 text-sm font-medium text-bg"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function BenchmarkCard({
  benchmark,
  goals,
  readOnly,
  onClick,
  onEdit,
}: {
  benchmark: Benchmark
  goals: Goal[]
  readOnly?: boolean
  onClick: () => void
  onEdit?: () => void
}) {
  const progress = benchmarkProgress(benchmark)
  const achieved = isAchieved(benchmark)
  const linked = goals.find((g) => g.id === benchmark.goal_id)

  return (
    <div
      className="w-full rounded-2xl border bg-surface p-4"
      style={{ borderColor: achieved ? benchmark.color : `${benchmark.color}40` }}
    >
      <div className="flex w-full items-center gap-3">
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: `${benchmark.color}26` }}
          >
            {benchmark.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">
              {benchmark.title} {achieved && '🏆'}
            </p>
            <p className="truncate text-xs text-ink-dim">
              {formatValue(benchmark.best_value, benchmark.value_format, benchmark.unit)}
              {' → '}
              {formatValue(benchmark.target_value, benchmark.value_format, benchmark.unit)}
              {linked && ` · ${linked.emoji} ${linked.title}`}
            </p>
          </div>
          <span className="text-ink-dim">›</span>
        </button>
        {!readOnly && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 px-2 py-1 text-sm text-ink-dim underline decoration-dotted underline-offset-2"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(progress ?? 0) * 100}%`, backgroundColor: benchmark.color }}
          />
        </div>
        <p className="mt-1 text-[11px] text-ink-dim">{remainingLabel(benchmark)}</p>
      </div>
    </div>
  )
}

const WEEK_BAR_HEIGHT = 22

function GoalCard({
  goal,
  today,
  logs,
  readOnly,
  onClick,
  onEdit,
}: {
  goal: Goal
  today: string
  logs?: Map<string, GoalLog>
  readOnly?: boolean
  onClick?: () => void
  onEdit?: () => void
}) {
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
    <div
      className="w-full rounded-2xl border bg-surface p-4 text-left"
      style={{ borderColor: `${goal.color}40` }}
    >
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: `${goal.color}26` }}
          >
            {goal.emoji}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate font-medium text-ink">{goal.title}</p>
            <p className="text-xs text-ink-dim">
              {goal.kind === 'counter' ? `${goal.target_per_day} ${goal.unit ?? ''}/day` : goal.difficulty}
              {streak > 0 && ` · 🔥 ${streak} day${streak === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="text-ink-dim">›</span>
        </button>
        {!readOnly && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 px-2 py-1 text-sm text-ink-dim underline decoration-dotted underline-offset-2"
          >
            Edit
          </button>
        )}
      </div>

      {/* Counter goals get proportional-height bars (how much of the day's
          target was hit); checkbox goals collapse to full-or-empty. */}
      <div className="mt-3 flex items-end gap-1" style={{ height: WEEK_BAR_HEIGHT }}>
        {week.map((d) => (
          <span
            key={d.date}
            className="relative flex-1 overflow-hidden rounded-md bg-border"
            style={{ height: WEEK_BAR_HEIGHT }}
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
}
