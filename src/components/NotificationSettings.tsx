import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  isIOS,
  type PushStatus,
} from '../lib/push'

interface Settings {
  quiet_hours_start: string | null
  quiet_hours_end: string | null
}

interface Reminder {
  id: string
  at: string
  label: string | null
}

const MAX_REMINDERS = 6

function trimTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

// Suggest a time that isn't taken yet, so "Add a reminder" lands on something
// usable instead of colliding with an existing row.
function suggestTime(existing: Reminder[]): string {
  const taken = new Set(existing.map((r) => trimTime(r.at)))
  for (const candidate of ['09:00', '13:00', '18:00', '21:00', '07:00', '15:00']) {
    if (!taken.has(candidate)) return candidate
  }
  return '12:00'
}

export function NotificationSettings() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<PushStatus>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings>({
    quiet_hours_start: null,
    quiet_hours_end: null,
  })
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await getPushStatus())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const profileId = profile?.id

  useEffect(() => {
    if (!profileId) return
    supabase
      .from('user_settings')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('profile_id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data as Settings)
      })
  }, [profileId])

  const loadReminders = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase
      .from('reminders')
      .select('id, at, label')
      .eq('profile_id', profileId)
      .order('at', { ascending: true })
    setReminders((data as Reminder[] | null) ?? [])
  }, [profileId])

  useEffect(() => {
    void loadReminders()
  }, [loadReminders])

  async function handleEnable() {
    if (!profile) return
    setBusy(true)
    setError('')
    try {
      setStatus(await subscribeToPush(profile.id))
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function handleDisable() {
    setBusy(true)
    setError('')
    try {
      await unsubscribeFromPush()
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function saveSettings(next: Settings) {
    if (!profile) return
    setSettings(next)
    const { error: writeError } = await supabase.from('user_settings').upsert(
      {
        profile_id: profile.id,
        quiet_hours_start: next.quiet_hours_start || null,
        quiet_hours_end: next.quiet_hours_end || null,
      },
      { onConflict: 'profile_id' },
    )
    if (!writeError) {
      flashSaved()
    }
  }

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function addReminder() {
    if (!profile) return
    setError('')
    const { error: writeError } = await supabase
      .from('reminders')
      .insert({ profile_id: profile.id, at: suggestTime(reminders) })
    if (writeError) {
      setError(writeError.message)
      return
    }
    await loadReminders()
    flashSaved()
  }

  async function updateReminder(id: string, patch: Partial<Reminder>) {
    setError('')
    // Optimistic so the time picker doesn't snap back while the write is in
    // flight; a failure reloads the real values.
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const { error: writeError } = await supabase.from('reminders').update(patch).eq('id', id)
    if (writeError) {
      setError(
        writeError.code === '23505'
          ? 'You already have a reminder at that time.'
          : writeError.message,
      )
      await loadReminders()
      return
    }
    flashSaved()
  }

  async function removeReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    await supabase.from('reminders').delete().eq('id', id)
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium text-ink">Notifications</h2>

      {status === 'needs-install' && (
        <div className="mt-3 rounded-xl border border-border bg-surface-raised p-3 text-sm text-ink-dim">
          <p className="font-medium text-ink">Add to Home Screen first</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>Open this page in Safari (not Chrome, not an in-app browser).</li>
            <li>
              Tap the <span className="text-ink">Share</span> icon.
            </li>
            <li>
              Tap <span className="text-ink">Add to Home Screen</span>, then Add.
            </li>
            <li>Open the app from the new icon and come back here.</li>
          </ol>
          <p className="mt-2 text-xs">
            iPhone only allows notifications for apps installed to the Home Screen,
            and needs iOS 16.4 or later. Not available in the EU.
          </p>
        </div>
      )}

      {status === 'unsupported' && (
        <p className="mt-3 text-sm text-ink-dim">
          This browser doesn't support push notifications.
          {isIOS() && ' On iPhone, use Safari and add the app to your Home Screen.'}
        </p>
      )}

      {status === 'denied' && (
        <p className="mt-3 text-sm text-ink-dim">
          Notifications are blocked. Turn them back on in your browser or system
          settings for this app, then reopen this screen.
        </p>
      )}

      {status === 'default' && (
        <>
          <p className="mt-2 text-sm text-ink-dim">
            Get nudges from her, streak milestones, and your daily reminder.
          </p>
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            className="mt-3 min-h-11 w-full rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
          >
            {busy ? 'Enabling…' : 'Turn on notifications'}
          </button>
        </>
      )}

      {status === 'subscribed' && (
        <>
          <p className="mt-2 flex items-center gap-2 text-sm text-ink">
            <span className="h-2 w-2 rounded-full bg-mine" /> Notifications are on
            for this device.
          </p>
          <button
            type="button"
            onClick={() => void handleDisable()}
            disabled={busy}
            className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink-dim disabled:opacity-60"
          >
            {busy ? 'Turning off…' : 'Turn off on this device'}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm text-ink-dim">Daily reminders</p>

        <div className="mt-2 space-y-2">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="flex items-center gap-2">
              <input
                type="time"
                value={trimTime(reminder.at)}
                onChange={(e) => {
                  if (e.target.value) void updateReminder(reminder.id, { at: e.target.value })
                }}
                className="min-h-11 w-28 shrink-0 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink [color-scheme:dark] focus:border-mine focus:outline-none"
              />
              <input
                type="text"
                value={reminder.label ?? ''}
                placeholder="Label (optional)"
                maxLength={40}
                onChange={(e) =>
                  setReminders((prev) =>
                    prev.map((r) => (r.id === reminder.id ? { ...r, label: e.target.value } : r)),
                  )
                }
                onBlur={(e) => void updateReminder(reminder.id, { label: e.target.value || null })}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink placeholder:text-ink-dim focus:border-mine focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void removeReminder(reminder.id)}
                aria-label="Remove reminder"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-ink-dim"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {reminders.length < MAX_REMINDERS ? (
          <button
            type="button"
            onClick={() => void addReminder()}
            className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-border px-4 py-2 text-sm font-medium text-ink-dim"
          >
            + Add a reminder
          </button>
        ) : (
          <p className="mt-2 text-xs text-ink-dim">
            That's the maximum of {MAX_REMINDERS}. Remove one to add another.
          </p>
        )}

        <p className="mt-2 text-xs text-ink-dim">
          {reminders.length === 0
            ? 'No reminders yet. Add as many as you want through the day.'
            : 'Each one is only sent if you still have something left that day.'}
        </p>

        <p className="mt-4 text-sm text-ink-dim">Quiet hours</p>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="time"
            value={trimTime(settings.quiet_hours_start)}
            onChange={(e) =>
              void saveSettings({ ...settings, quiet_hours_start: e.target.value || null })
            }
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink [color-scheme:dark] focus:border-mine focus:outline-none"
          />
          <span className="text-sm text-ink-dim">to</span>
          <input
            type="time"
            value={trimTime(settings.quiet_hours_end)}
            onChange={(e) =>
              void saveSettings({ ...settings, quiet_hours_end: e.target.value || null })
            }
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink [color-scheme:dark] focus:border-mine focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-ink-dim">
          Nudges sent during quiet hours are held and delivered after, not dropped.
        </p>

        {saved && <p className="mt-2 text-xs text-mine">Saved ✓</p>}
      </div>
    </section>
  )
}
