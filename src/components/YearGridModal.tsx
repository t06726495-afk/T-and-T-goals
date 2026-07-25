import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { todayInTimezone } from '../lib/date'
import { currentStreak, shiftDate } from '../lib/streak'
import { buildYearGrid, longestStreak, daysElapsedInYear, counterIntensity } from '../lib/yeargrid'
import type { Difficulty, Goal, GoalLog } from '../lib/types'

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const CELL = 13
const GAP = 3
const LABEL_COL = 28

interface YearGridModalProps {
  goal: Goal
  onClose: () => void
  readOnly?: boolean
}

export function YearGridModal({ goal, onClose, readOnly }: YearGridModalProps) {
  const { profile } = useAuth()
  const today = profile ? todayInTimezone(profile.timezone) : new Date().toISOString().slice(0, 10)
  const currentYear = Number(today.slice(0, 4))
  const minYear = Number(goal.created_at.slice(0, 4))

  const [year, setYear] = useState(currentYear)
  const [logs, setLogs] = useState<Map<string, GoalLog>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [template, setTemplate] = useState<{ id: string; title: string; difficulty: Difficulty } | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('goal_logs')
      .select('*')
      .eq('goal_id', goal.id)
      .gte('log_date', `${year}-01-01`)
      .lte('log_date', `${year}-12-31`)
    const map = new Map<string, GoalLog>()
    for (const l of (data as GoalLog[] | null) ?? []) map.set(l.log_date, l)
    setLogs(map)
    setLoading(false)
  }, [goal.id, year])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (goal.kind !== 'checkbox' || !profile || readOnly) return
    supabase
      .from('task_templates')
      .select('id, title, difficulty')
      .eq('goal_id', goal.id)
      .eq('owner_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setTemplate(data))
  }, [goal.id, goal.kind, profile, readOnly])

  const completedDates = useMemo(() => {
    const s = new Set<string>()
    for (const [date, log] of logs) if (log.completed) s.add(date)
    return s
  }, [logs])

  const { weeks, monthLabels } = useMemo(() => buildYearGrid(year, today), [year, today])

  const streakRef = year >= currentYear ? today : `${year}-12-31`
  const streak = currentStreak(completedDates, streakRef)
  const longest = longestStreak(completedDates, year, today)
  const elapsed = daysElapsedInYear(year, today)
  const completedCount = completedDates.size
  const pct = elapsed > 0 ? Math.round((completedCount / elapsed) * 100) : 0

  const editableFrom = shiftDate(today, -7)

  function cellStyle(date: string | null, isFuture: boolean, isToday: boolean) {
    if (!date) return { backgroundColor: 'transparent' }
    if (isFuture) return { backgroundColor: 'var(--color-surface-raised)', opacity: 0.35 }

    const log = logs.get(date)
    if (goal.kind === 'checkbox') {
      return {
        backgroundColor: log?.completed ? goal.color : 'var(--color-surface-raised)',
        boxShadow: isToday ? `0 0 0 2px ${goal.color}` : undefined,
      }
    }
    const level = counterIntensity(log?.count ?? 0, goal.target_per_day ?? 1)
    const alpha = ['00', '40', '99', 'ff'][level]
    return {
      backgroundColor: level === 0 ? 'var(--color-surface-raised)' : `${goal.color}${alpha}`,
      boxShadow: isToday ? `0 0 0 2px ${goal.color}` : undefined,
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="safe-bottom max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
              style={{ backgroundColor: `${goal.color}26` }}
            >
              {goal.emoji}
            </span>
            <h2 className="text-lg font-semibold text-ink">{goal.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-dim"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Streak" value={`${streak}`} />
          <Stat label="Longest" value={`${longest}`} />
          <Stat label="Days done" value={`${completedCount}`} />
          <Stat label="This year" value={`${pct}%`} />
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={year <= minYear}
            onClick={() => setYear((y) => y - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-dim disabled:opacity-30"
          >
            ‹
          </button>
          <span className="w-14 text-center font-medium text-ink">{year}</span>
          <button
            type="button"
            disabled={year >= currentYear}
            onClick={() => setYear((y) => y + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-dim disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-center text-ink-dim">Loading…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div
              className="relative inline-grid"
              style={{
                gridTemplateColumns: `${LABEL_COL}px repeat(53, ${CELL}px)`,
                gridTemplateRows: `14px repeat(7, ${CELL}px)`,
                gap: `${GAP}px`,
              }}
            >
              {monthLabels.map((m) => (
                <span
                  key={m.weekIndex}
                  className="text-[10px] text-ink-dim"
                  style={{ gridColumn: m.weekIndex + 2, gridRow: 1 }}
                >
                  {m.label}
                </span>
              ))}

              {DAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="sticky left-0 z-10 bg-surface text-[10px] leading-[13px] text-ink-dim"
                  style={{ gridColumn: 1, gridRow: i + 2 }}
                >
                  {label}
                </span>
              ))}

              {weeks.map((col, w) =>
                col.map((cell, d) => (
                  <button
                    key={`${w}-${d}`}
                    type="button"
                    disabled={!cell.date || cell.isFuture}
                    onClick={() => cell.date && setSelectedDate(cell.date)}
                    className="rounded-[3px] disabled:cursor-default"
                    style={{
                      gridColumn: w + 2,
                      gridRow: d + 2,
                      width: CELL,
                      height: CELL,
                      ...cellStyle(cell.date, cell.isFuture, cell.isToday),
                    }}
                    aria-label={cell.date ?? undefined}
                  />
                )),
              )}
            </div>
          </div>
        )}
      </div>

      {selectedDate && (
        <DayPopover
          date={selectedDate}
          goal={goal}
          log={logs.get(selectedDate) ?? null}
          editable={!readOnly && selectedDate >= editableFrom && selectedDate <= today}
          template={template}
          onClose={() => setSelectedDate(null)}
          onSaved={() => {
            setSelectedDate(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised py-2">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-dim">{label}</p>
    </div>
  )
}

function DayPopover({
  date,
  goal,
  log,
  editable,
  template,
  onClose,
  onSaved,
}: {
  date: string
  goal: Goal
  log: GoalLog | null
  editable: boolean
  template: { id: string; title: string; difficulty: Difficulty } | null
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [count, setCount] = useState((log?.count ?? 0).toString())
  const [saving, setSaving] = useState(false)

  const formatted = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  async function toggleCheckbox() {
    if (!profile) return
    setSaving(true)
    const nextDone = !(log?.completed ?? false)

    if (template) {
      await supabase.from('tasks').upsert(
        {
          owner_id: profile.id,
          template_id: template.id,
          goal_id: goal.id,
          title: template.title,
          task_date: date,
          difficulty: template.difficulty,
          time_of_day: 'any',
          done: nextDone,
        },
        { onConflict: 'owner_id,template_id,task_date' },
      )
    }

    await supabase.from('goal_logs').upsert(
      {
        goal_id: goal.id,
        owner_id: profile.id,
        log_date: date,
        completed: nextDone,
        count: nextDone ? 1 : 0,
      },
      { onConflict: 'goal_id,log_date' },
    )

    setSaving(false)
    onSaved()
  }

  async function saveCount() {
    if (!profile) return
    const value = Math.max(0, Math.round(Number(count)) || 0)
    setSaving(true)
    await supabase.from('goal_logs').upsert(
      {
        goal_id: goal.id,
        owner_id: profile.id,
        log_date: date,
        count: value,
        completed: value >= (goal.target_per_day ?? 1),
      },
      { onConflict: 'goal_id,log_date' },
    )
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-medium text-ink">{formatted}</p>

        {goal.kind === 'checkbox' ? (
          <p className="mt-2 text-sm text-ink-dim">
            {log?.completed ? 'Completed' : 'Not completed'}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">
            {log?.count ?? 0} / {goal.target_per_day} {goal.unit ?? ''}
          </p>
        )}

        {editable ? (
          goal.kind === 'checkbox' ? (
            <button
              type="button"
              onClick={() => void toggleCheckbox()}
              disabled={saving}
              className="mt-4 min-h-11 w-full rounded-xl px-4 py-2 font-medium text-bg disabled:opacity-60"
              style={{ backgroundColor: goal.color }}
            >
              {saving ? 'Saving…' : log?.completed ? 'Mark not completed' : 'Mark completed'}
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:outline-none"
                style={{ borderColor: goal.color }}
              />
              <button
                type="button"
                onClick={() => void saveCount()}
                disabled={saving}
                className="min-h-11 rounded-xl px-4 py-2 font-medium text-bg disabled:opacity-60"
                style={{ backgroundColor: goal.color }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )
        ) : (
          <p className="mt-3 text-xs text-ink-dim">
            Only the last 7 days can be corrected.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink-dim"
        >
          Close
        </button>
      </div>
    </div>
  )
}
