import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient, sendToProfile, requireEnv } from '../_lib/push.js'

// Hit on a schedule by GitHub Actions (see .github/workflows/reminders.yml).
// Two jobs:
//   1. Flush nudges that were queued behind the recipient's quiet hours.
//   2. Send each person's daily reminder once their chosen local time has
//      passed.
// Runs frequently (every 15 min) because "9am" means a different instant in
// every timezone; last_reminder_on keeps it to one send per local day.
//
// Also doubles as the Supabase keepalive — a free project auto-pauses after
// 7 days with no activity, and this touches the database continuously.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = requireEnv('CRON_SECRET')
  const provided = req.headers['x-cron-secret']
  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const admin = adminClient()
    const nowIso = new Date().toISOString()

    // --- 1. Queued nudges whose quiet window has passed -------------------
    const { data: pending } = await admin
      .from('nudges')
      .select('id, to_id, from_id, body, emoji')
      .is('delivered_at', null)
      .lte('deliver_after', nowIso)
      .limit(50)

    let nudgesSent = 0
    for (const nudge of pending ?? []) {
      const { data: sender } = await admin
        .from('profiles')
        .select('display_name, avatar_emoji')
        .eq('id', nudge.from_id as string)
        .maybeSingle()

      const result = await sendToProfile(admin, nudge.to_id as string, {
        title: `${sender?.avatar_emoji ?? '💬'} ${sender?.display_name ?? 'Your partner'}`,
        body: `${nudge.emoji ? `${nudge.emoji} ` : ''}${nudge.body as string}`,
        url: '/partner',
        tag: 'nudge',
      })
      nudgesSent += result.sent

      await admin.from('nudges').update({ delivered_at: nowIso }).eq('id', nudge.id)
    }

    // --- 2. Daily reminders ------------------------------------------------
    const { data: settings } = await admin
      .from('user_settings')
      .select('profile_id, daily_reminder_time, last_reminder_on, profiles(timezone, display_name)')
      .not('daily_reminder_time', 'is', null)

    let remindersSent = 0
    for (const row of settings ?? []) {
      const profile = row.profiles as unknown as { timezone: string; display_name: string } | null
      const tz = profile?.timezone || 'UTC'

      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())

      if (row.last_reminder_on === localDate) continue

      const localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date())

      const target = String(row.daily_reminder_time).slice(0, 5)
      if (localTime < target) continue

      // Skip if there's nothing left to do today — a reminder for an
      // already-finished day is just noise.
      const { count: openTasks } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', row.profile_id as string)
        .eq('task_date', localDate)
        .eq('done', false)

      if ((openTasks ?? 0) > 0) {
        const result = await sendToProfile(admin, row.profile_id as string, {
          title: 'mogging',
          body:
            openTasks === 1
              ? '1 thing left today'
              : `${openTasks} things left today`,
          url: '/',
          tag: 'daily-reminder',
        })
        remindersSent += result.sent
      }

      await admin
        .from('user_settings')
        .update({ last_reminder_on: localDate })
        .eq('profile_id', row.profile_id as string)
    }

    res.status(200).json({ ok: true, nudgesSent, remindersSent })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
