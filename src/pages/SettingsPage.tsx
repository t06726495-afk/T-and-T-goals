import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { CoupleInfo, Profile } from '../lib/types'

const EMOJI_CHOICES = ['🙂', '😎', '🥰', '🔥', '🌱', '💪', '🐶', '🐱', '⭐', '🎯']
const COLOR_CHOICES = ['#22c55e', '#ec4899', '#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#ef4444', '#eab308']

export function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Settings</h1>

      {profile && <ProfileForm profile={profile} onSaved={refreshProfile} />}

      <PairingCard />

      <div className="mt-8 rounded-2xl border border-border bg-surface p-4 text-sm text-ink-dim">
        Notifications, data export, and goal archiving arrive in later
        phases.
      </div>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-8 min-h-11 w-full rounded-xl border border-border px-4 py-2 font-medium text-danger"
      >
        Sign out
      </button>
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
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
        />
      </label>

      <div className="mt-4">
        <p className="text-sm text-ink-dim">Avatar</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {EMOJI_CHOICES.map((e) => (
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
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-ink focus:border-mine focus:outline-none"
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
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-partner/30 bg-partner/10 p-3">
          <span className="text-2xl">{partner.avatar_emoji}</span>
          <p className="text-sm text-ink">
            Paired with{' '}
            <span className="font-medium">{partner.display_name}</span> 🎉
          </p>
        </div>
      )}

      {!loading && couple && couple.member_count === 1 && (
        <>
          <p className="mt-2 text-sm text-ink-dim">
            Share this code with her — she enters it below to pair.
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
