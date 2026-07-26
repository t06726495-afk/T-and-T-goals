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
  daily_reminder_time: string | null
}

function trimTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

export function NotificationSettings() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<PushStatus>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings>({
    quiet_hours_start: null,
    quiet_hours_end: null,
    daily_reminder_time: null,
  })
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await getPushStatus())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('user_settings')
      .select('quiet_hours_start, quiet_hours_end, daily_reminder_time')
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data as Settings)
      })
  }, [profile])

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
        daily_reminder_time: next.daily_reminder_time || null,
      },
      { onConflict: 'profile_id' },
    )
    if (!writeError) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
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
        <label className="block text-sm text-ink-dim">
          Daily reminder
          <input
            type="time"
            value={trimTime(settings.daily_reminder_time)}
            onChange={(e) =>
              void saveSettings({ ...settings, daily_reminder_time: e.target.value || null })
            }
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none"
          />
          <span className="mt-1 block text-xs text-ink-dim">
            Only sent if you still have something left that day.
          </span>
        </label>

        <p className="mt-4 text-sm text-ink-dim">Quiet hours</p>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="time"
            value={trimTime(settings.quiet_hours_start)}
            onChange={(e) =>
              void saveSettings({ ...settings, quiet_hours_start: e.target.value || null })
            }
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink focus:border-mine focus:outline-none"
          />
          <span className="text-sm text-ink-dim">to</span>
          <input
            type="time"
            value={trimTime(settings.quiet_hours_end)}
            onChange={(e) =>
              void saveSettings({ ...settings, quiet_hours_end: e.target.value || null })
            }
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink focus:border-mine focus:outline-none"
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
