import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatValue, parseValue, benchmarkProgress, remainingLabel, isAchieved } from '../lib/benchmarks'
import { PointsChart, type ChartSeries } from './PointsChart'
import { Confetti } from './Confetti'
import { haptic } from '../lib/motion'
import type { Benchmark, BenchmarkEntry } from '../lib/types'

export function BenchmarkDetailModal({
  benchmark,
  readOnly,
  onClose,
  onChanged,
}: {
  benchmark: Benchmark
  readOnly?: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { profile } = useAuth()
  const [current, setCurrent] = useState(benchmark)
  const [entries, setEntries] = useState<BenchmarkEntry[]>([])
  const [valueInput, setValueInput] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [celebrate, setCelebrate] = useState(false)

  const load = useCallback(async () => {
    const [{ data: entryRows }, { data: fresh }] = await Promise.all([
      supabase
        .from('benchmark_entries')
        .select('*')
        .eq('benchmark_id', benchmark.id)
        .order('recorded_on', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('benchmarks').select('*').eq('id', benchmark.id).maybeSingle(),
    ])
    setEntries((entryRows as BenchmarkEntry[]) ?? [])
    if (fresh) setCurrent(fresh as Benchmark)
  }, [benchmark.id])

  useEffect(() => {
    void load()
  }, [load])

  async function logEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    const value = parseValue(valueInput, current.value_format)
    if (value === null) {
      setError(current.value_format === 'time' ? 'Try a time like 7:42' : 'Enter a number')
      return
    }

    setSaving(true)
    setError('')
    const wasAchieved = isAchieved(current)

    const { error: insertError } = await supabase.from('benchmark_entries').insert({
      benchmark_id: current.id,
      owner_id: profile.id,
      value,
      note: note.trim() || null,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setValueInput('')
    setNote('')

    const { data: fresh } = await supabase
      .from('benchmarks')
      .select('*')
      .eq('id', current.id)
      .maybeSingle()

    if (fresh) {
      const updated = fresh as Benchmark
      setCurrent(updated)
      if (!wasAchieved && isAchieved(updated)) {
        haptic('celebrate')
        setCelebrate(true)
        setTimeout(() => setCelebrate(false), 2500)
      }
    }

    await load()
    setSaving(false)
    onChanged()
  }

  async function deleteEntry(id: string) {
    setSaving(true)
    await supabase.from('benchmark_entries').delete().eq('id', id)
    await load()
    setSaving(false)
    onChanged()
  }

  const progress = benchmarkProgress(current)
  const achieved = isAchieved(current)

  const series: ChartSeries[] =
    entries.length > 1
      ? [
          {
            key: 'value',
            label: current.title,
            color: current.color,
            values: entries.map((en) => en.value),
          },
        ]
      : []

  const labels = entries.map((en) =>
    new Date(`${en.recorded_on}T00:00:00`).toLocaleDateString(undefined, {
      month: 'numeric',
      day: 'numeric',
    }),
  )

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="safe-bottom relative max-h-[90dvh] w-full max-w-lg overscroll-contain overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {celebrate && <Confetti />}

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
              style={{ backgroundColor: `${current.color}26` }}
            >
              {current.emoji}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink">{current.title}</h2>
              <p className="text-xs text-ink-dim">
                Target {formatValue(current.target_value, current.value_format, current.unit)}
                {current.direction === 'lower' ? ' or lower' : ' or higher'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-ink-dim"
          >
            ✕
          </button>
        </div>

        {achieved && (
          <div className="mt-4 rounded-2xl border border-mine/40 bg-mine/10 p-3 text-center">
            <p className="font-semibold text-ink">Benchmark hit 🏆</p>
            <p className="mt-0.5 text-xs text-ink-dim">
              +{current.points_awarded} points ·{' '}
              {new Date(current.achieved_at!).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border bg-surface-raised p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-ink-dim">Best so far</p>
              <p className="text-2xl font-semibold" style={{ color: current.color }}>
                {formatValue(current.best_value, current.value_format, current.unit)}
              </p>
            </div>
            <p className="text-sm text-ink-dim">{remainingLabel(current)}</p>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(progress ?? 0) * 100}%`,
                backgroundColor: current.color,
              }}
            />
          </div>
          {current.start_value !== null && (
            <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
              <span>from {formatValue(current.start_value, current.value_format, current.unit)}</span>
              <span>{formatValue(current.target_value, current.value_format, current.unit)}</span>
            </div>
          )}
        </div>

        {series.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-ink-dim">Progress</h3>
            <div className="mt-2">
              <PointsChart labels={labels} series={series} />
            </div>
          </div>
        )}

        {!readOnly && (
          <form onSubmit={logEntry} className="mt-4">
            <h3 className="text-sm font-medium text-ink-dim">Log a result</h3>
            <div className="mt-2 flex gap-2">
              <input
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.form?.requestSubmit()}
                inputMode={current.value_format === 'time' ? 'text' : 'decimal'}
                placeholder={current.value_format === 'time' ? '7:42' : '215'}
                className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:outline-none"
                style={{ borderColor: `${current.color}66` }}
              />
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 rounded-xl px-4 py-2 font-medium text-bg disabled:opacity-60"
                style={{ backgroundColor: current.color }}
              >
                {saving ? '…' : 'Log'}
              </button>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="Note (optional)"
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </form>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-medium text-ink-dim">History</h3>
          {entries.length === 0 ? (
            <p className="mt-2 rounded-xl border border-border bg-surface-raised p-4 text-center text-sm text-ink-dim">
              Nothing logged yet.{!readOnly && ' Log your first result above.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {[...entries].reverse().map((en) => {
                const isBest = en.value === current.best_value
                return (
                  <li
                    key={en.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2"
                  >
                    <span className="font-medium text-ink">
                      {formatValue(en.value, current.value_format, current.unit)}
                    </span>
                    {isBest && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${current.color}26`, color: current.color }}
                      >
                        best
                      </span>
                    )}
                    <span className="flex-1 truncate text-xs text-ink-dim">{en.note}</span>
                    <span className="text-xs text-ink-dim">
                      {new Date(`${en.recorded_on}T00:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => void deleteEntry(en.id)}
                        className="text-xs text-ink-dim"
                        aria-label="Delete entry"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
