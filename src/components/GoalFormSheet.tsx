import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  GOAL_EMOJI_CHOICES,
  COLOR_CHOICES,
  DIFFICULTY_OPTIONS,
  UNIT_PRESETS,
  TITLE_PLACEHOLDER,
} from '../lib/pickers'
import type { Difficulty, Goal, GoalKind, Visibility } from '../lib/types'

interface GoalFormSheetProps {
  goal?: Goal
  onClose: () => void
  onSaved: () => void
}

function preventEnterSubmit(e: React.KeyboardEvent) {
  if (e.key === 'Enter') e.preventDefault()
}

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none'

export function GoalFormSheet({ goal, onClose, onSaved }: GoalFormSheetProps) {
  const { profile, coupleId } = useAuth()
  const isEdit = Boolean(goal)

  const [title, setTitle] = useState(goal?.title ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? GOAL_EMOJI_CHOICES[0])
  const [customEmojiMode, setCustomEmojiMode] = useState(false)
  const [color, setColor] = useState(goal?.color ?? profile?.accent_color ?? COLOR_CHOICES[0])
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'checkbox')
  const [target, setTarget] = useState(goal?.target_per_day?.toString() ?? '10')
  const [unit, setUnit] = useState(goal?.unit ?? UNIT_PRESETS[0])
  const [customUnitMode, setCustomUnitMode] = useState(
    Boolean(goal?.unit) && !UNIT_PRESETS.includes(goal?.unit ?? ''),
  )
  const [difficulty, setDifficulty] = useState<Difficulty>(goal?.difficulty ?? 'easy')
  const [category, setCategory] = useState(goal?.category ?? '')
  const [visibility, setVisibility] = useState<Visibility>(goal?.visibility ?? 'private')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Swipe-down-to-dismiss on the handle bar only, so it doesn't fight with
  // scrolling the form content. The touchmove listener is attached natively
  // (not via React's onTouchMove prop) because browsers — and React's own
  // event delegation in some versions — default touch listeners to passive,
  // which silently ignores preventDefault(). Without that, the page behind
  // the sheet scrolls along with the drag, which is what made this feel
  // glitchy before.
  const handleRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const dragYRef = useRef(0)
  const [dragY, setDragYState] = useState(0)
  const [closing, setClosing] = useState(false)

  function setDragY(value: number) {
    dragYRef.current = value
    setDragYState(value)
  }

  useEffect(() => {
    const el = handleRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      dragStartY.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (dragStartY.current === null) return
      const delta = e.touches[0].clientY - dragStartY.current
      if (delta > 0) {
        e.preventDefault()
        setDragY(delta)
      }
    }
    const onTouchEnd = () => {
      if (dragYRef.current > 80) {
        setClosing(true)
        setDragY(window.innerHeight)
        setTimeout(onClose, 200)
      } else {
        setDragY(0)
      }
      dragStartY.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onClose])

  function handleBackdropClick() {
    setClosing(true)
    setTimeout(onClose, 150)
  }

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
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      style={{ transition: 'background-color 0.2s', backgroundColor: closing ? 'transparent' : undefined }}
      onClick={handleBackdropClick}
    >
      <div
        className="safe-bottom max-h-[90dvh] w-full max-w-lg overscroll-contain overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 || closing ? 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      >
        <div ref={handleRef} className="mx-auto -mt-1 mb-2 h-8 w-16 touch-none sm:hidden">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />
        </div>
        <h2 className="text-lg font-semibold text-ink">{isEdit ? 'Edit goal' : 'New goal'}</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm text-ink-dim">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={preventEnterSubmit}
              placeholder={TITLE_PLACEHOLDER}
              className={inputClass}
            />
          </label>

          <div>
            <p className="text-sm text-ink-dim">Emoji</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {GOAL_EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEmoji(e)
                    setCustomEmojiMode(false)
                  }}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
                    !customEmojiMode && emoji === e
                      ? 'border-mine bg-mine/10'
                      : 'border-border bg-surface-raised'
                  }`}
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomEmojiMode(true)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
                  customEmojiMode ? 'border-mine bg-mine/10 text-mine' : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                +
              </button>
            </div>
            {customEmojiMode && (
              <input
                autoFocus
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                onKeyDown={preventEnterSubmit}
                placeholder="Paste or type any emoji"
                className={`${inputClass} mt-2 text-center text-2xl`}
              />
            )}
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
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-11 rounded-xl border border-border bg-surface-raised"
                aria-label="Custom color"
              />
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
                  onKeyDown={preventEnterSubmit}
                  className={inputClass}
                />
              </label>
              <label className="block flex-1 text-sm text-ink-dim">
                Unit
                <select
                  value={customUnitMode ? '__custom__' : unit}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomUnitMode(true)
                      setUnit('')
                    } else {
                      setCustomUnitMode(false)
                      setUnit(e.target.value)
                    }
                  }}
                  className={inputClass}
                >
                  {UNIT_PRESETS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {customUnitMode && (
                  <input
                    autoFocus
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    placeholder="type a unit"
                    className={`${inputClass} mt-2`}
                  />
                )}
              </label>
            </div>
          )}

          <label className="block text-sm text-ink-dim">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={inputClass}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} — {d.points} pt{d.points === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-dim">
              Point values are being tuned further in a later phase.
            </span>
          </label>

          <label className="block text-sm text-ink-dim">
            Category (optional)
            <input
              placeholder="Health, Home, Work…"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={preventEnterSubmit}
              className={inputClass}
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
