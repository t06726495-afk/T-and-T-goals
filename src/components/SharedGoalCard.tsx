import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatAmount, remainingLabel } from '../lib/shared'
import { haptic } from '../lib/motion'
import { Confetti } from './Confetti'
import type { Profile, SharedGoal, SharedGoalEntry } from '../lib/types'

// A shared goal shows the total first, then who put in what. The split is the
// point: it's the only screen in the app where your two numbers sit side by
// side deliberately, and it works because you're both adding to the same
// total rather than being ranked against each other.
export function SharedGoalCard({
  goal,
  entries,
  partner,
  onChanged,
  onEdit,
}: {
  goal: SharedGoal
  entries: SharedGoalEntry[]
  partner: Profile | null
  onChanged: () => void
  onEdit: () => void
}) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  const real = entries.filter((e) => !e.is_bonus)
  const total = real.reduce((sum, e) => sum + Number(e.amount), 0)
  const mine = real
    .filter((e) => e.owner_id === profile?.id)
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const theirs = total - mine

  const done = goal.achieved_at !== null

  async function addContribution() {
    const value = Number(amount)
    if (!profile || !Number.isFinite(value) || value === 0) return

    setBusy(true)
    const { error } = await supabase.from('shared_goal_entries').insert({
      shared_goal_id: goal.id,
      owner_id: profile.id,
      amount: value,
      note: note.trim() || null,
    })
    setBusy(false)

    if (!error) {
      if (total + value >= goal.target_value && !done) {
        haptic('celebrate')
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 900)
      } else {
        haptic('done')
      }
      setAmount('')
      setNote('')
      setAdding(false)
      onChanged()
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-surface p-4"
      style={{ borderColor: done ? goal.color : `${goal.color}40` }}
    >
      {celebrating && <Confetti />}

      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ backgroundColor: `${goal.color}26` }}
        >
          {goal.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {goal.title} {done && '🎉'}
          </p>
          <p className="text-xs text-ink-dim">
            {formatAmount(total, goal.value_format, goal.unit)} of{' '}
            {formatAmount(goal.target_value, goal.value_format, goal.unit)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 px-2 py-1 text-sm text-ink-dim underline decoration-dotted underline-offset-2"
        >
          Edit
        </button>
      </div>

      {/* One bar, split by who contributed what. Two bars would read as a
          race; this reads as one thing you're filling in together. */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(goal.target_value > 0 ? Math.min(1, mine / goal.target_value) : 0) * 100}%`,
            backgroundColor: 'var(--color-mine)',
          }}
        />
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(goal.target_value > 0 ? Math.min(1, theirs / goal.target_value) : 0) * 100}%`,
            backgroundColor: 'var(--color-partner)',
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mine" />
          You {formatAmount(mine, goal.value_format, goal.unit)}
        </span>
        {partner && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-partner" />
            {partner.display_name} {formatAmount(theirs, goal.value_format, goal.unit)}
          </span>
        )}
        <span style={{ color: done ? goal.color : undefined }}>
          {remainingLabel(goal, total)}
        </span>
      </div>

      {adding ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={goal.value_format === 'money' ? 'Amount' : 'How much'}
              className="min-h-11 w-32 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink focus:border-mine focus:outline-none"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={80}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink placeholder:text-ink-dim focus:border-mine focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setAmount('')
                setNote('')
              }}
              className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium text-ink-dim"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addContribution()}
              disabled={busy || !amount}
              className="min-h-11 flex-[2] rounded-xl px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
              style={{ backgroundColor: goal.color }}
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        !done && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-ink-dim"
          >
            + Add to this
          </button>
        )
      )}

      {real.length > 0 && <RecentEntries entries={real} goal={goal} partner={partner} />}
    </div>
  )
}

function RecentEntries({
  entries,
  goal,
  partner,
}: {
  entries: SharedGoalEntry[]
  goal: SharedGoal
  partner: Profile | null
}) {
  const { profile } = useAuth()
  const [expanded, setExpanded] = useState(false)

  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const shown = expanded ? sorted : sorted.slice(0, 3)

  return (
    <div className="mt-3 border-t border-border pt-2">
      {shown.map((e) => {
        const isMine = e.owner_id === profile?.id
        return (
          <div key={e.id} className="flex items-center justify-between py-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink-dim">
              <span style={{ color: isMine ? 'var(--color-mine)' : 'var(--color-partner)' }}>
                {isMine ? 'You' : (partner?.display_name ?? 'Partner')}
              </span>
              {e.note && ` · ${e.note}`}
            </span>
            <span className="tabular shrink-0 text-ink">
              +{formatAmount(Number(e.amount), goal.value_format, goal.unit)}
            </span>
          </div>
        )
      })}
      {sorted.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-ink-dim underline decoration-dotted underline-offset-2"
        >
          {expanded ? 'Show less' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}
