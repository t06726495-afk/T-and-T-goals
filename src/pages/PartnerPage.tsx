import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { todayInTimezone } from '../lib/date'
import { currentStreak, lastSevenDayFractions } from '../lib/streak'
import { NudgeComposer } from '../components/NudgeComposer'
import type { Goal, GoalLog, Profile } from '../lib/types'

const STREAK_LOOKBACK_DAYS = 60

interface FeedItem {
  kind: 'completion' | 'benchmark' | 'nudge'
  actor_id: string
  target_id: string | null
  title: string | null
  emoji: string | null
  color: string | null
  body: string | null
  occurred_at: string
}

export function PartnerPage() {
  const { profile } = useAuth()
  const [partner, setPartner] = useState<Profile | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [logsByGoal, setLogsByGoal] = useState<Map<string, Map<string, GoalLog>>>(new Map())
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [nudging, setNudging] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = profile ? todayInTimezone(profile.timezone) : new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const { data: sharedGoals } = await supabase
      .from('goals')
      .select('*')
      .neq('owner_id', profile.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    const shared = (sharedGoals as Goal[]) ?? []
    setGoals(shared)

    if (shared.length > 0) {
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', shared[0].owner_id)
        .maybeSingle()
      setPartner((partnerProfile as Profile) ?? null)

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - STREAK_LOOKBACK_DAYS)
      const { data: logs } = await supabase
        .from('goal_logs')
        .select('*')
        .in(
          'goal_id',
          shared.map((g) => g.id),
        )
        .gte('log_date', cutoff.toISOString().slice(0, 10))

      const map = new Map<string, Map<string, GoalLog>>()
      for (const log of (logs as GoalLog[] | null) ?? []) {
        if (!map.has(log.goal_id)) map.set(log.goal_id, new Map())
        map.get(log.goal_id)!.set(log.log_date, log)
      }
      setLogsByGoal(map)
    } else {
      setPartner(null)
    }

    // If she hasn't shared any goals we still want the partner's identity
    // (for the nudge composer), so fall back to the couple membership.
    if (shared.length === 0) {
      const { data: membership } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('profile_id', profile.id)
        .maybeSingle()
      if (membership) {
        const { data: other } = await supabase
          .from('couple_members')
          .select('profiles(*)')
          .eq('couple_id', membership.couple_id)
          .neq('profile_id', profile.id)
          .maybeSingle()
        setPartner((other?.profiles as unknown as Profile) ?? null)
      }
    }

    const { data: feedRows } = await supabase.rpc('together_feed', { p_limit: 40 })
    setFeed((feedRows as FeedItem[]) ?? [])

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/" className="text-sm text-ink-dim">
        ← Today
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Partner</h1>

      {!partner ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-ink">Not paired yet</p>
          <p className="mt-1 text-sm text-ink-dim">
            Pair up in Settings to see each other's shared goals.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-partner/20 bg-surface p-4">
            <span className="text-2xl">{partner.avatar_emoji}</span>
            <p className="min-w-0 flex-1 truncate font-medium text-ink">
              {partner.display_name}
            </p>
            <button
              type="button"
              onClick={() => setNudging(true)}
              className="min-h-11 shrink-0 rounded-full bg-partner px-4 py-2 text-sm font-medium text-bg"
            >
              Nudge
            </button>
          </div>

          {goals.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-center">
              <p className="text-sm text-ink">No shared goals yet</p>
              <p className="mt-1 text-xs text-ink-dim">
                Goals she marks as shared will show up here.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {goals.map((goal) => {
              const logs = logsByGoal.get(goal.id)
              const completedDates = new Set(
                [...(logs?.values() ?? [])].filter((l) => l.completed).map((l) => l.log_date),
              )
              const streak = currentStreak(completedDates, today)
              const week = lastSevenDayFractions(
                logs,
                today,
                goal.kind === 'counter' ? goal.target_per_day : null,
              )
              return (
                <div key={goal.id} className="rounded-2xl border border-partner/20 bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.emoji}</span>
                    <div className="flex-1">
                      <p className="font-medium text-ink">{goal.title}</p>
                      {streak > 0 && (
                        <p className="text-xs text-ink-dim">
                          🔥 {streak} day{streak === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-1" style={{ height: 22 }}>
                    {week.map((d) => (
                      <span
                        key={d.date}
                        className="relative flex-1 overflow-hidden rounded-md bg-border"
                        style={{ height: 22 }}
                      >
                        <span
                          className="absolute bottom-0 left-0 w-full rounded-md transition-all duration-500"
                          style={{
                            height: `${d.fraction * 100}%`,
                            backgroundColor: goal.color,
                            opacity: d.done ? 1 : 0.75,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-ink-dim">Together</h2>
            {feed.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border p-5 text-center">
                <p className="text-sm text-ink">Nothing here yet</p>
                <p className="mt-1 text-xs text-ink-dim">
                  Completions, benchmarks, and nudges will show up here.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {feed.map((item, i) => (
                  <FeedRow
                    key={`${item.kind}-${item.occurred_at}-${i}`}
                    item={item}
                    meId={profile.id}
                    myName={profile.display_name}
                    partnerName={partner.display_name}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {nudging && partner && (
        <NudgeComposer
          partner={partner}
          onClose={() => setNudging(false)}
          onSent={() => void load()}
        />
      )}
    </div>
  )
}

function FeedRow({
  item,
  meId,
  myName,
  partnerName,
}: {
  item: FeedItem
  meId: string
  myName: string
  partnerName: string
}) {
  const mine = item.actor_id === meId
  const actor = mine ? myName : partnerName
  const accent = mine ? 'var(--color-mine)' : 'var(--color-partner)'

  let text: string
  if (item.kind === 'completion') {
    text = `finished ${item.title}`
  } else if (item.kind === 'benchmark') {
    text = `hit their target: ${item.title}`
  } else {
    text = mine ? `nudged ${partnerName}: "${item.body}"` : `nudged you: "${item.body}"`
  }

  const when = new Date(item.occurred_at)
  const label = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: `${item.color ?? accent}26` }}
      >
        {item.emoji ?? (item.kind === 'nudge' ? '💬' : '✓')}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-ink">
        <span className="font-medium" style={{ color: accent }}>
          {actor}
        </span>{' '}
        <span className="text-ink-dim">{text}</span>
      </p>
      <span className="shrink-0 text-xs text-ink-dim">{label}</span>
    </li>
  )
}
