import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { COLOR_CHOICES, DIFFICULTY_OPTIONS } from '../lib/pickers'
import { EmojiPicker } from './EmojiPicker'
import type { Difficulty, SharedGoal, SharedValueFormat } from '../lib/types'

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none'

function noEnterSubmit(e: React.KeyboardEvent) {
  if (e.key === 'Enter') e.preventDefault()
}

const SHARED_EMOJI = ['🤝', '💰', '🏠', '✈️', '🎁', '🍽️', '🏖️', '💍', '🚗', '📅']

export function SharedGoalFormSheet({
  goal,
  onClose,
  onSaved,
}: {
  goal?: SharedGoal
  onClose: () => void
  onSaved: () => void
}) {
  const { profile, coupleId } = useAuth()
  const isEdit = Boolean(goal)

  const [title, setTitle] = useState(goal?.title ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🤝')
  const [color, setColor] = useState(goal?.color ?? '#8b5cf6')
  const [valueFormat, setValueFormat] = useState<SharedValueFormat>(goal?.value_format ?? 'money')
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target_value) : '')
  const [difficulty, setDifficulty] = useState<Difficulty>(goal?.difficulty ?? 'medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !coupleId) return

    const targetValue = Number(target)
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      setError('Give it a target bigger than zero.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      title: title.trim(),
      emoji,
      color,
      target_value: targetValue,
      unit: valueFormat === 'money' ? null : unit.trim() || null,
      value_format: valueFormat,
      difficulty,
    }

    const { error: writeError } = isEdit
      ? await supabase.from('shared_goals').update(payload).eq('id', goal!.id)
      : await supabase
          .from('shared_goals')
          .insert({ ...payload, couple_id: coupleId, created_by: profile.id })

    setSaving(false)
    if (writeError) {
      setError(writeError.message)
      return
    }
    onSaved()
  }

  async function handleArchive() {
    if (!goal) return
    setSaving(true)
    await supabase
      .from('shared_goals')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('id', goal.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="safe-bottom max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">
          {isEdit ? 'Edit shared goal' : 'New shared goal'}
        </h2>
        <p className="mt-1 text-xs text-ink-dim">
          Something you're both putting into, like saving for a trip. You each log what
          you add and it fills up together.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm text-ink-dim">
            What are you working toward?
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={noEnterSubmit}
              placeholder="Save for a trip, 12 date nights…"
              className={inputClass}
            />
          </label>

          <div>
            <p className="text-sm text-ink-dim">Counted as</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValueFormat('money')}
                className={`min-h-11 rounded-xl border font-medium ${
                  valueFormat === 'money'
                    ? 'border-mine bg-mine/10 text-mine'
                    : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                Money
              </button>
              <button
                type="button"
                onClick={() => setValueFormat('number')}
                className={`min-h-11 rounded-xl border font-medium ${
                  valueFormat === 'number'
                    ? 'border-mine bg-mine/10 text-mine'
                    : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                A count
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <label className="block flex-1 text-sm text-ink-dim">
              Target
              <input
                required
                type="number"
                inputMode="decimal"
                min={0}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={noEnterSubmit}
                placeholder={valueFormat === 'money' ? '1000' : '12'}
                className={inputClass}
              />
            </label>
            {valueFormat === 'number' && (
              <label className="block flex-1 text-sm text-ink-dim">
                Unit
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  onKeyDown={noEnterSubmit}
                  placeholder="dates, trips…"
                  className={inputClass}
                />
              </label>
            )}
          </div>

          <div>
            <p className="text-sm text-ink-dim">Icon</p>
            <EmojiPicker value={emoji} onChange={setEmoji} presets={SHARED_EMOJI} />
          </div>

          <div>
            <p className="text-sm text-ink-dim">Colour</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-full border-2 ${
                    color === c ? 'border-ink' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <label className="block text-sm text-ink-dim">
            How big a deal is it?
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={inputClass}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} · {d.points} pts
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-dim">
              Points are split by how much of the target each contribution covers, and you
              both get the full value again when it's reached.
            </span>
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
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
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </button>
          </div>

          {isEdit && (
            <button
              type="button"
              onClick={() => void handleArchive()}
              className="w-full py-2 text-center text-sm text-ink-dim underline"
            >
              Archive this goal
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
