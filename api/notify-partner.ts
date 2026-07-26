import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient, userClient, sendToProfile, bearerToken } from './_lib/push.js'

type EventKind = 'goal_completed' | 'streak_milestone' | 'benchmark_hit'

// Fired by the client when something worth celebrating happens. Everything
// that decides WHETHER to notify is re-derived server-side from the
// database (is the goal actually shared? is the caller actually paired?) so
// a tampered request can't push arbitrary text to someone.
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

  const { kind, goal_id, benchmark_id, streak } = (req.body ?? {}) as {
    kind?: EventKind
    goal_id?: string
    benchmark_id?: string
    streak?: number
  }

  try {
    const supabase = userClient(token)
    const { data: userData } = await supabase.auth.getUser()
    const me = userData.user?.id
    if (!me) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const admin = adminClient()

    const { data: membership } = await admin
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', me)
      .maybeSingle()
    if (!membership) {
      res.status(200).json({ ok: true, skipped: 'not paired' })
      return
    }

    const { data: partnerRow } = await admin
      .from('couple_members')
      .select('profile_id')
      .eq('couple_id', membership.couple_id)
      .neq('profile_id', me)
      .maybeSingle()
    if (!partnerRow) {
      res.status(200).json({ ok: true, skipped: 'no partner' })
      return
    }
    const partnerId = partnerRow.profile_id as string

    const { data: meProfile } = await admin
      .from('profiles')
      .select('display_name, avatar_emoji')
      .eq('id', me)
      .maybeSingle()
    const myName = meProfile?.display_name ?? 'Your partner'
    const myEmoji = meProfile?.avatar_emoji ?? '🎉'

    let body: string | null = null
    let tag = 'partner'

    if (kind === 'goal_completed' || kind === 'streak_milestone') {
      if (!goal_id) {
        res.status(400).json({ error: 'goal_id required' })
        return
      }
      const { data: goal } = await admin
        .from('goals')
        .select('title, emoji, visibility, owner_id')
        .eq('id', goal_id)
        .maybeSingle()

      // Only shared goals owned by the caller may be announced.
      if (!goal || goal.owner_id !== me || goal.visibility !== 'shared') {
        res.status(200).json({ ok: true, skipped: 'not a shared goal' })
        return
      }

      if (kind === 'streak_milestone') {
        const days = Number(streak)
        if (!Number.isFinite(days) || days < 7 || days % 7 !== 0) {
          res.status(200).json({ ok: true, skipped: 'not a milestone' })
          return
        }
        body = `${goal.emoji} ${days} day streak on ${goal.title}`
        tag = `streak-${goal_id}`
      } else {
        body = `${goal.emoji} finished ${goal.title}`
        tag = `goal-${goal_id}`
      }
    } else if (kind === 'benchmark_hit') {
      if (!benchmark_id) {
        res.status(400).json({ error: 'benchmark_id required' })
        return
      }
      const { data: bm } = await admin
        .from('benchmarks')
        .select('title, emoji, visibility, owner_id, achieved_at')
        .eq('id', benchmark_id)
        .maybeSingle()

      if (!bm || bm.owner_id !== me || bm.visibility !== 'shared' || !bm.achieved_at) {
        res.status(200).json({ ok: true, skipped: 'not a shared achieved benchmark' })
        return
      }
      body = `${bm.emoji} hit their target: ${bm.title}`
      tag = `benchmark-${benchmark_id}`
    } else {
      res.status(400).json({ error: 'Unknown kind' })
      return
    }

    // Celebrations respect quiet hours too, and are simply skipped rather
    // than queued — a "nice job" three hours late is noise.
    const { data: deliverAfter } = await admin.rpc('next_deliverable_at', {
      p_profile_id: partnerId,
    })
    if (deliverAfter && new Date(deliverAfter as string).getTime() > Date.now() + 1000) {
      res.status(200).json({ ok: true, skipped: 'quiet hours' })
      return
    }

    const result = await sendToProfile(admin, partnerId, {
      title: `${myEmoji} ${myName}`,
      body,
      url: '/partner',
      tag,
    })

    res.status(200).json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
