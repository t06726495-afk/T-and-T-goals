import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { levelProgress, levelThreshold } from '../lib/levels'
import type { Profile } from '../lib/types'

interface DayPoints {
  log_date: string
  points: number
}

export function PointsPage() {
  const { profile, refreshProfile } = useAuth()
  const [partner, setPartner] = useState<Profile | null>(null)
  const [myWeek, setMyWeek] = useState<DayPoints[]>([])
  const [partnerWeek, setPartnerWeek] = useState<DayPoints[]>([])
  const [myStreak, setMyStreak] = useState(0)
  const [partnerStreak, setPartnerStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    await refreshProfile()

    const { data: myMembership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', profile.id)
      .maybeSingle()

    let partnerProfile: Profile | null = null
    if (myMembership) {
      const { data: partnerMember } = await supabase
        .from('couple_members')
        .select('profile_id, profiles(*)')
        .eq('couple_id', myMembership.couple_id)
        .neq('profile_id', profile.id)
        .maybeSingle()
      partnerProfile = (partnerMember?.profiles as unknown as Profile) ?? null
    }
    setPartner(partnerProfile)

    const [{ data: myWeekData }, { data: myStreakData }] = await Promise.all([
      supabase.rpc('points_this_week', { p_profile_id: profile.id }),
      supabase.rpc('longest_active_streak', { p_profile_id: profile.id }),
    ])
    setMyWeek(((myWeekData as DayPoints[] | null) ?? []).map((d) => ({ ...d, points: Number(d.points) })))
    setMyStreak(Number(myStreakData) || 0)

    if (partnerProfile) {
      const [{ data: pWeekData }, { data: pStreakData }] = await Promise.all([
        supabase.rpc('points_this_week', { p_profile_id: partnerProfile.id }),
        supabase.rpc('longest_active_streak', { p_profile_id: partnerProfile.id }),
      ])
      setPartnerWeek(((pWeekData as DayPoints[] | null) ?? []).map((d) => ({ ...d, points: Number(d.points) })))
      setPartnerStreak(Number(pStreakData) || 0)
    } else {
      setPartnerWeek([])
      setPartnerStreak(0)
    }

    setLoading(false)
    // refreshProfile is stable from context; profile.id is what actually
    // varies and is already captured via `profile`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  const myWeekTotal = myWeek.reduce((sum, d) => sum + d.points, 0)
  const partnerWeekTotal = partnerWeek.reduce((sum, d) => sum + d.points, 0)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Points</h1>
      <p className="mt-1 text-sm text-ink-dim">How you're both doing.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <PersonCard
          emoji={profile.avatar_emoji}
          name={profile.display_name}
          color="var(--color-mine)"
          total={profile.points_total}
          level={profile.current_level}
          weekTotal={myWeekTotal}
          streak={myStreak}
        />
        {partner ? (
          <PersonCard
            emoji={partner.avatar_emoji}
            name={partner.display_name}
            color="var(--color-partner)"
            total={partner.points_total}
            level={partner.current_level}
            weekTotal={partnerWeekTotal}
            streak={partnerStreak}
          />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border p-4 text-center text-xs text-ink-dim">
            Pair up in Settings to see her side.
          </div>
        )}
      </div>

      {partner && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-ink-dim">This week</h2>
          <WeeklyChart myWeek={myWeek} partnerWeek={partnerWeek} />
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-ink-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-mine" /> {profile.display_name}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-partner" /> {partner.display_name}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function PersonCard({
  emoji,
  name,
  color,
  total,
  level,
  weekTotal,
  streak,
}: {
  emoji: string
  name: string
  color: string
  total: number
  level: number
  weekTotal: number
  streak: number
}) {
  const { fraction } = levelProgress(total, level)
  const toNext = levelThreshold(level + 1) - total

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <p className="truncate font-medium text-ink">{name}</p>
      </div>

      <p className="mt-3 text-2xl font-semibold" style={{ color }}>
        {total}
      </p>
      <p className="text-xs text-ink-dim">total points</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-ink-dim">
          <span>Level {level}</span>
          <span>{Math.max(0, toNext)} to next</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${fraction * 100}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-dim">
        <span>{weekTotal} this week</span>
        {streak > 0 && <span>🔥 {streak}d</span>}
      </div>
    </div>
  )
}

function WeeklyChart({ myWeek, partnerWeek }: { myWeek: DayPoints[]; partnerWeek: DayPoints[] }) {
  const max = Math.max(1, ...myWeek.map((d) => d.points), ...partnerWeek.map((d) => d.points))
  const maxBarHeight = 96

  return (
    <div className="mt-2 flex items-end justify-between gap-2 rounded-2xl border border-border bg-surface p-4">
      {myWeek.map((day, i) => {
        const partnerDay = partnerWeek[i]
        const label = new Date(`${day.log_date}T00:00:00`).toLocaleDateString(undefined, {
          weekday: 'narrow',
        })
        return (
          <div key={day.log_date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 items-end gap-1">
              <div
                className="w-2.5 rounded-t bg-mine"
                style={{ height: `${(day.points / max) * maxBarHeight}px` }}
              />
              <div
                className="w-2.5 rounded-t bg-partner"
                style={{ height: `${((partnerDay?.points ?? 0) / max) * maxBarHeight}px` }}
              />
            </div>
            <span className="text-[10px] text-ink-dim">{label}</span>
          </div>
        )
      })}
    </div>
  )
}
