import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { GOAL_EMOJI_CHOICES, COLOR_CHOICES, DIFFICULTY_OPTIONS } from '../lib/pickers'
import { parseValue, formatValue, UNIT_PRESETS_BENCHMARK } from '../lib/benchmarks'
import type {
  Benchmark,
  BenchmarkDirection,
  Difficulty,
  Goal,
  ValueFormat,
  Visibility,
} from '../lib/types'

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none'

function noEnterSubmit(e: React.KeyboardEvent) {
  if (e.key === 'Enter') e.preventDefault()
}

export function BenchmarkFormSheet({
  benchmark,
  goals,
  onClose,
  onSaved,
}: {
  benchmark?: Benchmark
  goals: Goal[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile, coupleId } = useAuth()
  const isEdit = Boolean(benchmark)

  const [title, setTitle] = useState(benchmark?.title ?? '')
  const [emoji, setEmoji] = useState(benchmark?.emoji ?? '🏆')
  const [color, setColor] = useState(benchmark?.color ?? profile?.accent_color ?? COLOR_CHOICES[0])
  const [valueFormat, setValueFormat] = useState<ValueFormat>(benchmark?.value_format ?? 'number')
  const [direction, setDirection] = useState<BenchmarkDirection>(benchmark?.direction ?? 'higher')
  const [unit, setUnit] = useState(benchmark?.unit ?? '')
  const [targetInput, setTargetInput] = useState(
    benchmark ? formatValue(benchmark.target_value, benchmark.value_format).replace(/ .*/, '') : '',
  )
  const [startInput, setStartInput] = useState(
    benchmark?.start_value != null
      ? formatValue(benchmark.start_value, benchmark.value_format).replace(/ .*/, '')
      : '',
  )
  const [goalId, setGoalId] = useState(benchmark?.goal_id ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(benchmark?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(benchmark?.visibility ?? 'private')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !coupleId) return

    const target = parseValue(targetInput, valueFormat)
    if (target === null) {
      setError(valueFormat === 'time' ? 'Target should look like 7:30' : 'Target must be a number')
      return
    }
    const start = startInput.trim() ? parseValue(startInput, valueFormat) : null
    if (startInput.trim() && start === null) {
      setError(valueFormat === 'time' ? 'Starting point should look like 9:15' : 'Starting point must be a number')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      title: title.trim(),
      emoji,
      color,
      unit: unit.trim() || null,
      direction,
      value_format: valueFormat,
      target_value: target,
      start_value: start,
      goal_id: goalId || null,
      difficulty,
      visibility,
    }

    const { error: writeError } = isEdit
      ? await supabase.from('benchmarks').update(payload).eq('id', benchmark!.id)
      : await supabase
          .from('benchmarks')
          .insert({ ...payload, owner_id: profile.id, couple_id: coupleId })

    setSaving(false)
    if (writeError) {
      setError(writeError.message)
      return
    }
    onSaved()
  }

  async function handleArchive() {
    if (!benchmark) return
    setSaving(true)
    await supabase
      .from('benchmarks')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('id', benchmark.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="safe-bottom max-h-[90dvh] w-full max-w-lg overscroll-contain overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">
          {isEdit ? 'Edit benchmark' : 'New benchmark'}
        </h2>
        <p className="mt-1 text-xs text-ink-dim">
          A number you're working toward, like a sub-7:30 mile or a 225 bench.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm text-ink-dim">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={noEnterSubmit}
              placeholder="Sub 7:30 mile, Bench 225…"
              className={inputClass}
            />
          </label>

          <div>
            <p className="text-sm text-ink-dim">Measured as</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValueFormat('number')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  valueFormat === 'number' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Number
              </button>
              <button
                type="button"
                onClick={() => setValueFormat('time')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  valueFormat === 'time' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Time (m:ss)
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm text-ink-dim">Goal direction</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('higher')}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-medium ${
                  direction === 'higher' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Higher is better
              </button>
              <button
                type="button"
                onClick={() => setDirection('lower')}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-medium ${
                  direction === 'lower' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Lower is better
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <label className="block flex-1 text-sm text-ink-dim">
              Target
              <input
                required
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={noEnterSubmit}
                inputMode={valueFormat === 'time' ? 'text' : 'decimal'}
                placeholder={valueFormat === 'time' ? '7:30' : '225'}
                className={inputClass}
              />
            </label>
            <label className="block flex-1 text-sm text-ink-dim">
              Starting point
              <input
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onKeyDown={noEnterSubmit}
                inputMode={valueFormat === 'time' ? 'text' : 'decimal'}
                placeholder="optional"
                className={inputClass}
              />
            </label>
          </div>

          {valueFormat === 'number' && (
            <label className="block text-sm text-ink-dim">
              Unit
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                onKeyDown={noEnterSubmit}
                list="benchmark-units"
                placeholder="lbs, reps, miles…"
                className={inputClass}
              />
              <datalist id="benchmark-units">
                {UNIT_PRESETS_BENCHMARK.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          )}

          <label className="block text-sm text-ink-dim">
            Linked habit (optional)
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-dim">
              The daily habit that moves this number.
            </span>
          </label>

          <div>
            <p className="text-sm text-ink-dim">Emoji</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {['🏆', '⏱️', '🏋️', '⚖️', ...GOAL_EMOJI_CHOICES.slice(0, 6)].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
                    emoji === e ? 'border-mine bg-mine/10' : 'border-border bg-surface-raised'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-ink-dim">Color</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className="h-11 w-11 rounded-xl border-2"
                  style={{ backgroundColor: c, borderColor: color === c ? '#f4f4f6' : 'transparent' }}
                />
              ))}
            </div>
          </div>

          <label className="block text-sm text-ink-dim">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={inputClass}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} — {d.points * 5} pts when hit
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm text-ink-dim">Visibility</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  visibility === 'private' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => setVisibility('shared')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  visibility === 'shared' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Shared
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 py-2 font-medium text-ink-dim"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 flex-[2] rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save benchmark'}
            </button>
          </div>

          {isEdit && (
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={saving}
              className="min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
            >
              Archive this benchmark
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
