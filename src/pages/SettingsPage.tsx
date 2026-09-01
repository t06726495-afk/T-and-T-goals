import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { CoupleInfo, Goal, Profile } from '../lib/types'
import { EMOJI_CHOICES, COLOR_CHOICES } from '../lib/pickers'
import { NotificationSettings } from '../components/NotificationSettings'
import { EmojiPicker } from '../components/EmojiPicker'
import { exportMyData, downloadJson } from '../lib/export'

export function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Reached from the gear rather than a tab, so it needs its own way
          back. */}
      <Link to="/" className="text-sm text-ink-dim">
        ← Today
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Settings</h1>

      {profile && <ProfileForm profile={profile} onSaved={refreshProfile} />}

      <PairingCard />

      <NotificationSettings />

      {profile && <ArchivedGoalsCard profileId={profile.id} />}

      {profile && <DataCard profileId={profile.id} />}

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-8 min-h-11 w-full rounded-xl border border-border px-4 py-2 font-medium text-danger"
      >
        Sign out
      </button>

      <p className="mt-6 text-center text-xs text-ink-dim">mogging</p>
    </div>
  )
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [emoji, setEmoji] = useState(profile.avatar_emoji)
  const [color, setColor] = useState(profile.accent_color ?? COLOR_CHOICES[0])
  const [timezone, setTimezone] = useState(profile.timezone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || 'Someone',
        avatar_emoji: emoji,
        accent_color: color,
        timezone,
      })
      .eq('id', profile.id)

    setSaving(false)
    if (!error) {
      await onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium text-ink">Profile</h2>

      <label className="mt-4 block text-sm text-ink-dim">
        Display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none"
        />
      </label>

      <div className="mt-4">
        <p className="text-sm text-ink-dim">Avatar</p>
        <div className="mt-1">
          <EmojiPicker value={emoji} onChange={setEmoji} presets={EMOJI_CHOICES} />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm text-ink-dim">Accent color</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className="h-11 w-11 rounded-xl border-2"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#f4f4f6' : 'transparent',
              }}
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

      <label className="mt-4 block text-sm text-ink-dim">
        Timezone
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 min-h-11 rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
      </button>
    </section>
  )
}

function PairingCard() {
  const [couple, setCouple] = useState<CoupleInfo | null>(null)
  const [partner, setPartner] = useState<Profile | null>(null)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [togetherSince, setTogetherSince] = useState('')

  async function saveTogetherSince(value: string) {
    setTogetherSince(value)
    if (!value) return
    // couples has no update policy by design; this goes through an RPC.
    await supabase.rpc('set_together_since', { p_date: value })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_or_create_my_couple')
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    const info = data as CoupleInfo
    setCouple(info)

    const { data: coupleRow } = await supabase
      .from('couples')
      .select('together_since')
      .eq('id', info.couple_id)
      .maybeSingle()
    setTogetherSince((coupleRow?.together_since as string | null) ?? '')

    if (info.member_count === 2) {
      const { data: session } = await supabase.auth.getUser()
      const myId = session.user?.id
      const { data: memberRow } = await supabase
        .from('couple_members')
        .select('profile_id, profiles(*)')
        .eq('couple_id', info.couple_id)
        .neq('profile_id', myId ?? '')
        .maybeSingle()
      setPartner((memberRow?.profiles as unknown as Profile) ?? null)
    } else {
      setPartner(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setJoining(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('join_couple', { p_code: code })
    setJoining(false)
    if (rpcError) {
      setError(
        rpcError.message === 'invalid_code'
          ? "That code doesn't match any invite."
          : rpcError.message === 'couple_full'
            ? 'That invite is already paired with someone.'
            : rpcError.message === 'already_paired'
              ? "You're already paired with someone."
              : rpcError.message,
      )
      return
    }
    setCode('')
    await load()
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium text-ink">Pairing</h2>

      {loading && <p className="mt-2 text-sm text-ink-dim">Loading…</p>}

      {!loading && couple && couple.member_count === 2 && partner && (
        <>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-partner/30 bg-partner/10 p-3">
            <span className="text-2xl">{partner.avatar_emoji}</span>
            <p className="text-sm text-ink">
              Paired with{' '}
              <span className="font-medium">{partner.display_name}</span> 🎉
            </p>
          </div>

          <label className="mt-4 block text-sm text-ink-dim">
            Together since
            <input
              type="date"
              value={togetherSince}
              onChange={(e) => void saveTogetherSince(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink [color-scheme:dark] focus:border-mine focus:outline-none"
            />
            <span className="mt-1 block text-xs text-ink-dim">
              Shows a days-together counter on Today.
            </span>
          </label>
        </>
      )}

      {!loading && couple && couple.member_count === 1 && (
        <>
          <p className="mt-2 text-sm text-ink-dim">
            Share this code with her. She enters it below to pair.
          </p>
          <p className="mt-2 text-center text-3xl font-bold tracking-[0.3em] text-mine">
            {couple.invite_code}
          </p>

          <form onSubmit={join} className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Or enter her code"
              maxLength={6}
              className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-4 py-2 uppercase tracking-widest text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-dim focus:border-mine focus:outline-none"
            />
            <button
              type="submit"
              disabled={joining || code.length < 6}
              className="min-h-11 rounded-xl bg-partner px-4 py-2 font-medium text-bg disabled:opacity-60"
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  )
}

function ArchivedGoalsCard({ profileId }: { profileId: string }) {
  const [archived, setArchived] = useState<Goal[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('owner_id', profileId)
      .eq('is_active', false)
      .order('archived_at', { ascending: false })
    setArchived((data as Goal[]) ?? [])
  }, [profileId])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(goal: Goal) {
    setBusy(goal.id)
    await supabase
      .from('goals')
      .update({ is_active: true, archived_at: null })
      .eq('id', goal.id)
    // Its daily template was deactivated on archive; bring that back too, or
    // the goal would reappear on Goals but never generate tasks again.
    await supabase
      .from('task_templates')
      .update({ is_active: true })
      .eq('goal_id', goal.id)
      .eq('owner_id', profileId)
    setBusy('')
    await load()
  }

  if (archived.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium text-ink">Archived goals</span>
        <span className="text-sm text-ink-dim">
          {archived.length} {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {archived.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3"
            >
              <span className="text-lg">{g.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{g.title}</span>
              <button
                type="button"
                onClick={() => void restore(g)}
                disabled={busy === g.id}
                className="min-h-11 shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink-dim disabled:opacity-50"
              >
                {busy === g.id ? '…' : 'Restore'}
              </button>
            </div>
          ))}
          <p className="text-xs text-ink-dim">
            Archiving never deletes history. Restoring brings back the full
            record.
          </p>
        </div>
      )}
    </section>
  )
}

function DataCard({ profileId }: { profileId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleExport() {
    setBusy(true)
    setError('')
    try {
      const data = await exportMyData(profileId)
      downloadJson(data, `mogging-export-${new Date().toISOString().slice(0, 10)}.json`)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium text-ink">Your data</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Download everything you've logged as a JSON file: goals, history,
        benchmarks, and nudges.
      </p>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 py-2 font-medium text-ink disabled:opacity-60"
      >
        {busy ? 'Preparing…' : 'Export my data'}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}
