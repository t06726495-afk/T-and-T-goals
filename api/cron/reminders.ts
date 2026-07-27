import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient, sendToProfile, requireEnv } from '../_lib/push.js'

// Hit on a schedule by GitHub Actions (see .github/workflows/reminders.yml).
// Two jobs:
//   1. Flush nudges that were queued behind the recipient's quiet hours.
//   2. Send each of a person's daily reminders once its chosen local time
//      has passed.
// Runs frequently (every 15 min) because "9am" means a different instant in
// every timezone; reminders.last_sent_on keeps each one to a single send per
// local day.
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
    // One row per reminder, so a person can have several a day. Each row
    // carries its own last_sent_on, which keeps every reminder to a single
    // send per local day without them blocking one another.
    const { data: reminders } = await admin
      .from('reminders')
      .select('id, profile_id, at, label, last_sent_on, profiles(timezone)')
      .eq('is_active', true)

    let remindersSent = 0
    // Someone with three reminders due in the same run shouldn't cost three
    // identical open-task queries.
    const openCounts = new Map<string, number>()

    for (const row of reminders ?? []) {
      const profileId = row.profile_id as string
      const profile = row.profiles as unknown as { timezone: string } | null
      const tz = profile?.timezone || 'UTC'

      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())

      if (row.last_sent_on === localDate) continue

      const localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date())

      const target = String(row.at).slice(0, 5)
      if (localTime < target) continue

      const cacheKey = `${profileId}:${localDate}`
      let openTasks = openCounts.get(cacheKey)
      if (openTasks === undefined) {
        // Skip if there's nothing left to do today — a reminder for an
        // already-finished day is just noise.
        const { count } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', profileId)
          .eq('task_date', localDate)
          .eq('done', false)
        openTasks = count ?? 0
        openCounts.set(cacheKey, openTasks)
      }

      if (openTasks > 0) {
        const label = (row.label as string | null)?.trim()
        const result = await sendToProfile(admin, profileId, {
          title: label || 'mogging',
          body: openTasks === 1 ? '1 thing left today' : `${openTasks} things left today`,
          url: '/',
          // Same tag for all of them: a later reminder should replace the
          // earlier notification rather than stack up on the lock screen.
          tag: 'daily-reminder',
        })
        remindersSent += result.sent
      }

      await admin
        .from('reminders')
        .update({ last_sent_on: localDate })
        .eq('id', row.id as string)
    }

    res.status(200).json({ ok: true, nudgesSent, remindersSent })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
