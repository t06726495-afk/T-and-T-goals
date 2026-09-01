import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { MOODS, moodFor } from '../lib/shared'
import type { JournalEntry, Profile } from '../lib/types'

// One entry per person per day, mood and words together. The mood is a single
// tap so it actually gets logged; the writing is optional and saves itself, so
// there's no "did I remember to hit save" to worry about.
export function JournalCard({
  today,
  partner,
  onSaved,
}: {
  today: string
  partner: Profile | null
  /** Journaling awards points, so the header total needs refreshing. */
  onSaved?: () => void
}) {
  const { profile } = useAuth()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [partnerEntry, setPartnerEntry] = useState<JournalEntry | null>(null)
  const [body, setBody] = useState('')
  const [open, setOpen] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const profileId = profile?.id
  const partnerId = partner?.id

  const load = useCallback(async () => {
    if (!profileId || !today) return

    const { data: mine } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('owner_id', profileId)
      .eq('entry_date', today)
      .maybeSingle()

    const row = (mine as JournalEntry | null) ?? null
    setEntry(row)
    setBody(row?.body ?? '')

    if (partnerId) {
      // RLS returns nothing here if she marked the entry private, so no
      // client-side visibility check is needed or trusted.
      const { data: theirs } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('owner_id', partnerId)
        .eq('entry_date', today)
        .maybeSingle()
      setPartnerEntry((theirs as JournalEntry | null) ?? null)
    } else {
      setPartnerEntry(null)
    }
  }, [profileId, partnerId, today])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  async function save(patch: Partial<JournalEntry>) {
    if (!profileId) return
    const { data } = await supabase
      .from('journal_entries')
      .upsert(
        {
          owner_id: profileId,
          entry_date: today,
          body: patch.body !== undefined ? patch.body : (entry?.body ?? null),
          mood: patch.mood !== undefined ? patch.mood : (entry?.mood ?? null),
          visibility:
            patch.visibility !== undefined ? patch.visibility : (entry?.visibility ?? 'shared'),
        },
        { onConflict: 'owner_id,entry_date' },
      )
      .select()
      .single()

    if (data) {
      setEntry(data as JournalEntry)
      setSavedAt(Date.now())
      onSaved?.()
    }
  }

  // Debounced so a paragraph is one write instead of one per keystroke.
  function handleBodyChange(value: string) {
    setBody(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save({ body: value || null }), 900)
  }

  const mood = entry?.mood ?? null
  const isPrivate = entry?.visibility === 'private'
  const partnerMood = moodFor(partnerEntry?.mood)

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">How was today?</p>
        {savedAt > 0 && Date.now() - savedAt < 2000 && (
          <span className="text-xs text-mine">Saved</span>
        )}
      </div>

      <div className="mt-3 flex justify-between gap-1">
        {MOODS.map((m) => {
          const on = mood === m.value
          return (
            <button
              key={m.value}
              type="button"
              aria-label={m.label}
              aria-pressed={on}
              onClick={() => void save({ mood: on ? null : m.value })}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 transition-transform active:scale-95 ${
                on ? 'border-mine bg-mine/10' : 'border-transparent'
              }`}
            >
              <span className={`text-2xl ${on ? '' : 'opacity-45 grayscale'}`}>{m.emoji}</span>
              <span className={`text-[10px] ${on ? 'text-mine' : 'text-ink-dim'}`}>{m.label}</span>
            </button>
          )
        })}
      </div>

      {open || body ? (
        <>
          <textarea
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onBlur={() => void save({ body: body || null })}
            rows={4}
            placeholder="Anything you want to remember about today…"
            className="mt-3 w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink placeholder:text-ink-dim focus:border-mine focus:outline-none"
          />

          {partner && (
            <button
              type="button"
              onClick={() => void save({ visibility: isPrivate ? 'shared' : 'private' })}
              className="mt-2 text-xs text-ink-dim underline decoration-dotted underline-offset-2"
            >
              {isPrivate
                ? `Private. Only you can read this. Tap to let ${partner.display_name} see it.`
                : `${partner.display_name} can read this. Tap to make it private.`}
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-border text-sm text-ink-dim"
        >
          Write something about today
        </button>
      )}

      {/* Her side, when she's written and left it shared. Read-only: a
          journal you can edit isn't a journal. */}
      {partner && (partnerMood || partnerEntry?.body) && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{partner.avatar_emoji}</span>
            <p className="text-sm text-ink-dim">{partner.display_name}</p>
            {partnerMood && <span className="text-lg">{partnerMood.emoji}</span>}
          </div>
          {partnerEntry?.body && (
            <p className="mt-2 whitespace-pre-line text-sm text-ink-dim">{partnerEntry.body}</p>
          )}
        </div>
      )}
    </div>
  )
}
