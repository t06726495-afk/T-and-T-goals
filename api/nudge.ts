import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient, userClient, sendToProfile, bearerToken } from './_lib/push.js'

const MAX_BODY_LENGTH = 280

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = bearerToken(req.headers.authorization)
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const { to_id, body, emoji, goal_id } = (req.body ?? {}) as {
    to_id?: string
    body?: string
    emoji?: string
    goal_id?: string | null
  }

  if (!to_id || !body?.trim()) {
    res.status(400).json({ error: 'to_id and body are required' })
    return
  }

  try {
    // Insert as the USER, so RLS enforces "you may only nudge your own
    // paired partner", and the DB trigger enforces the daily cap and the
    // quiet-hours delivery time.
    const supabase = userClient(token)
    const { data: inserted, error } = await supabase
      .from('nudges')
      .insert({
        to_id,
        from_id: (await supabase.auth.getUser()).data.user?.id,
        body: body.trim().slice(0, MAX_BODY_LENGTH),
        emoji: emoji ?? null,
        goal_id: goal_id ?? null,
      })
      .select('id, deliver_after, from_id')
      .single()

    if (error) {
      if (error.message.includes('nudge_rate_limit')) {
        res.status(429).json({ error: 'You have hit the 10 nudges per day limit.' })
        return
      }
      res.status(400).json({ error: error.message })
      return
    }

    // Queued behind quiet hours: stored now, pushed by the cron once the
    // recipient's quiet window ends. Deliberately not dropped.
    const deliverAfter = new Date(inserted.deliver_after as string)
    if (deliverAfter.getTime() > Date.now() + 1000) {
      res.status(200).json({ ok: true, queued: true, deliver_after: inserted.deliver_after })
      return
    }

    const admin = adminClient()
    const { data: sender } = await admin
      .from('profiles')
      .select('display_name, avatar_emoji')
      .eq('id', inserted.from_id as string)
      .maybeSingle()

    const senderName = sender?.display_name ?? 'Your partner'
    const result = await sendToProfile(admin, to_id, {
      title: `${sender?.avatar_emoji ?? '💬'} ${senderName}`,
      body: `${emoji ? `${emoji} ` : ''}${body.trim()}`,
      url: '/partner',
      tag: 'nudge',
    })

    await admin.from('nudges').update({ delivered_at: new Date().toISOString() }).eq('id', inserted.id)

    res.status(200).json({ ok: true, queued: false, ...result })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
