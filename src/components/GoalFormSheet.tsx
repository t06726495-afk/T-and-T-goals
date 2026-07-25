import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { GOAL_EMOJI_CHOICES, COLOR_CHOICES, DIFFICULTY_OPTIONS } from '../lib/pickers'
import type { Difficulty, Goal, GoalKind, Visibility } from '../lib/types'

interface GoalFormSheetProps {
  goal?: Goal
  onClose: () => void
  onSaved: () => void
}

export function GoalFormSheet({ goal, onClose, onSaved }: GoalFormSheetProps) {
  const { profile, coupleId } = useAuth()
  const isEdit = Boolean(goal)

  const [title, setTitle] = useState(goal?.title ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? GOAL_EMOJI_CHOICES[0])
  const [color, setColor] = useState(goal?.color ?? profile?.accent_color ?? COLOR_CHOICES[0])
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'checkbox')
  const [target, setTarget] = useState(goal?.target_per_day?.toString() ?? '10')
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(goal?.difficulty ?? 'easy')
  const [category, setCategory] = useState(goal?.category ?? '')
  const [visibility, setVisibility] = useState<Visibility>(goal?.visibility ?? 'private')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function ensureDailyTemplate(goalId: string, goalTitle: string) {
    const { data: existing } = await supabase
      .from('task_templates')
      .select('id')
      .eq('goal_id', goalId)
      .eq('owner_id', profile!.id)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('task_templates')
        .update({ title: goalTitle, difficulty, is_active: true })
        .eq('id', existing.id)
      return
    }

    await supabase.from('task_templates').insert({
      owner_id: profile!.id,
      goal_id: goalId,
      title: goalTitle,
      difficulty,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      time_of_day: 'any',
      source: 'manual',
    })
  }

  async function deactivateTemplates(goalId: string) {
    await supabase
      .from('task_templates')
      .update({ is_active: false })
      .eq('goal_id', goalId)
      .eq('owner_id', profile!.id)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !coupleId) return
    setSaving(true)
    setError('')

    const payload = {
      title: title.trim(),
      emoji,
      color,
      kind,
      target_per_day: kind === 'counter' ? Number(target) || 1 : null,
      unit: kind === 'counter' ? unit.trim() || null : null,
      difficulty,
      category: category.trim() || null,
      visibility,
    }

    if (isEdit && goal) {
      const { error: updateError } = await supabase.from('goals').update(payload).eq('id', goal.id)
      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
      if (kind === 'checkbox') {
        await ensureDailyTemplate(goal.id, payload.title)
      } else {
        await deactivateTemplates(goal.id)
      }
    } else {
      const { data: created, error: insertError } = await supabase
        .from('goals')
        .insert({ ...payload, owner_id: profile.id, couple_id: coupleId })
        .select()
        .single()
      if (insertError || !created) {
        setError(insertError?.message ?? 'Something went wrong.')
        setSaving(false)
        return
      }
      if (kind === 'checkbox') {
        await ensureDailyTemplate(created.id, payload.title)
      }
    }

    setSaving(false)
    onSaved()
  }

  async function handleArchive() {
    if (!goal) return
    setSaving(true)
    await supabase
      .from('goals')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('id', goal.id)
    await deactivateTemplates(goal.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="safe-bottom max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" />
        <h2 className="text-lg font-semibold text-ink">{isEdit ? 'Edit goal' : 'New goal'}</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm text-ink-dim">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
            />
          </label>

          <div>
            <p className="text-sm text-ink-dim">Emoji</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {GOAL_EMOJI_CHOICES.map((e) => (
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

          <div>
            <p className="text-sm text-ink-dim">Kind</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('checkbox')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  kind === 'checkbox' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Checkbox
              </button>
              <button
                type="button"
                onClick={() => setKind('counter')}
                className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
                  kind === 'counter' ? 'border-mine bg-mine/10 text-mine' : 'border-border text-ink-dim'
                }`}
              >
                Counter
              </button>
            </div>
          </div>

          {kind === 'counter' && (
            <div className="flex gap-3">
              <label className="block flex-1 text-sm text-ink-dim">
                Target per day
                <input
                  required
                  type="number"
                  min={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
                />
              </label>
              <label className="block flex-1 text-sm text-ink-dim">
                Unit
                <input
                  placeholder="glasses"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
                />
              </label>
            </div>
          )}

          <label className="block text-sm text-ink-dim">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-ink-dim">
            Category (optional)
            <input
              placeholder="Health, Home, Work…"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
            />
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
            <p className="mt-1 text-xs text-ink-dim">
              Private goals are invisible to her — even that they exist.
            </p>
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
              {saving ? 'Saving…' : 'Save goal'}
            </button>
          </div>

          {isEdit && (
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={saving}
              className="min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
            >
              Archive this goal
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
