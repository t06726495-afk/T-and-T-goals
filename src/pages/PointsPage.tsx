import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { levelProgress, levelThreshold } from '../lib/levels'
import {
  computeBadges,
  levelTitle,
  parseSummary,
  EMPTY_SUMMARY,
  type PointsSummary,
} from '../lib/gamification'
import { PointsChart, type ChartSeries } from '../components/PointsChart'
import { Confetti } from '../components/Confetti'
import type { Profile } from '../lib/types'

interface DayPoints {
  day: string
  points: number
}

const RANGES = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
]

function levelStorageKey(profileId: string) {
  return `mogging:level:${profileId}`
}

export function PointsPage() {
  const { profile, refreshProfile } = useAuth()
  const [partner, setPartner] = useState<Profile | null>(null)
  const [days, setDays] = useState(30)
  const [myHistory, setMyHistory] = useState<DayPoints[]>([])
  const [partnerHistory, setPartnerHistory] = useState<DayPoints[]>([])
  const [mySummary, setMySummary] = useState<PointsSummary>(EMPTY_SUMMARY)
  const [partnerSummary, setPartnerSummary] = useState<PointsSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)

  const profileId = profile?.id

  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    setError('')

    await refreshProfile()

    const { data: myMembership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', profileId)
      .maybeSingle()

    let partnerProfile: Profile | null = null
    if (myMembership) {
      const { data: partnerMember } = await supabase
        .from('couple_members')
        .select('profile_id, profiles(*)')
        .eq('couple_id', myMembership.couple_id)
        .neq('profile_id', profileId)
        .maybeSingle()
      partnerProfile = (partnerMember?.profiles as unknown as Profile) ?? null
    }
    setPartner(partnerProfile)

    const [{ data: hist, error: histErr }, { data: summ, error: summErr }] = await Promise.all([
      supabase.rpc('points_history', { p_profile_id: profileId, p_days: days }),
      supabase.rpc('points_summary', { p_profile_id: profileId }),
    ])

    if (histErr || summErr) {
      // Almost always "function does not exist" — the migration for this
      // phase hasn't been run yet.
      setError(
        'Points stats are unavailable. Run the latest migration in Supabase (see SETUP.md).',
      )
      setLoading(false)
      return
    }

    setMyHistory(((hist as DayPoints[] | null) ?? []).map((d) => ({ ...d, points: Number(d.points) })))
    setMySummary(parseSummary(summ))

    if (partnerProfile) {
      const [{ data: pHist }, { data: pSumm }] = await Promise.all([
        supabase.rpc('points_history', { p_profile_id: partnerProfile.id, p_days: days }),
        supabase.rpc('points_summary', { p_profile_id: partnerProfile.id }),
      ])
      setPartnerHistory(
        ((pHist as DayPoints[] | null) ?? []).map((d) => ({ ...d, points: Number(d.points) })),
      )
      setPartnerSummary(parseSummary(pSumm))
    } else {
      setPartnerHistory([])
      setPartnerSummary(EMPTY_SUMMARY)
    }

    setLoading(false)
    // Depends on profileId (stable), not the profile object — refreshProfile
    // above hands back a new object reference each call, so depending on the
    // object itself would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, days])

  useEffect(() => {
    void load()
  }, [load])

  // Level-up celebration: compare against the last level we showed this
  // person, so crossing a threshold is actually acknowledged instead of the
  // number quietly ticking up.
  useEffect(() => {
    if (!profile) return
    const key = levelStorageKey(profile.id)
    const seen = Number(localStorage.getItem(key) ?? '0')
    if (seen && profile.current_level > seen) {
      setLeveledUpTo(profile.current_level)
    }
    localStorage.setItem(key, String(profile.current_level))
  }, [profile])

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-ink">Points</h1>
        <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-ink">
          {error}
        </div>
      </div>
    )
  }

  const { fraction } = levelProgress(profile.points_total, profile.current_level)
  const toNext = Math.max(0, levelThreshold(profile.current_level + 1) - profile.points_total)
  const badges = computeBadges(profile.points_total, profile.current_level, mySummary)
  const earnedCount = badges.filter((b) => b.earned).length
  const weekDelta = mySummary.points_week - mySummary.points_prev_week
  const together = profile.points_total + (partner?.points_total ?? 0)

  const labels = myHistory.map((d) => {
    const date = new Date(`${d.day}T00:00:00`)
    return days <= 7
      ? date.toLocaleDateString(undefined, { weekday: 'narrow' })
      : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  })

  const series: ChartSeries[] = [
    {
      key: 'mine',
      label: profile.display_name,
      color: 'var(--color-mine)',
      values: myHistory.map((d) => d.points),
    },
  ]
  if (partner && partnerHistory.length === myHistory.length) {
    series.push({
      key: 'partner',
      label: partner.display_name,
      color: 'var(--color-partner)',
      values: partnerHistory.map((d) => d.points),
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Points</h1>
      <p className="mt-1 text-sm text-ink-dim">How you're both doing.</p>

      {leveledUpTo && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-mine/40 bg-mine/10 p-4 text-center">
          <Confetti />
          <p className="text-lg font-semibold text-ink">Level {leveledUpTo} 🎉</p>
          <p className="mt-1 text-sm text-ink-dim">You're now {levelTitle(leveledUpTo)}.</p>
          <button
            type="button"
            onClick={() => setLeveledUpTo(null)}
            className="mt-3 min-h-11 rounded-xl bg-mine px-4 py-2 text-sm font-medium text-bg"
          >
            Nice
          </button>
        </div>
      )}

      {/* Your level hero */}
      <div className="mt-4 rounded-2xl border border-mine/30 bg-surface p-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-mine) 18%, transparent)' }}
          >
            <span className="text-[10px] uppercase tracking-wide text-ink-dim">Lvl</span>
            <span className="text-2xl font-bold leading-none text-mine">
              {profile.current_level}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{levelTitle(profile.current_level)}</p>
            <p className="text-sm text-ink-dim">
              {profile.points_total} points total
            </p>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-mine transition-all duration-500"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-dim">
              {toNext} to level {profile.current_level + 1}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <MiniStat label="Today" value={`${mySummary.points_today}`} />
          <MiniStat
            label="This week"
            value={`${mySummary.points_week}`}
            sub={
              mySummary.points_prev_week > 0
                ? `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last`
                : undefined
            }
          />
          <MiniStat label="Best streak" value={`${mySummary.best_streak}d`} />
        </div>
      </div>

      {/* Side by side */}
      {partner && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PersonCard
            emoji={profile.avatar_emoji}
            name={profile.display_name}
            color="var(--color-mine)"
            total={profile.points_total}
            level={profile.current_level}
            summary={mySummary}
          />
          <PersonCard
            emoji={partner.avatar_emoji}
            name={partner.display_name}
            color="var(--color-partner)"
            total={partner.points_total}
            level={partner.current_level}
            summary={partnerSummary}
          />
        </div>
      )}

      {/* Chart */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-dim">Points over time</h2>
          <div className="flex gap-1 rounded-full border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  days === r.days ? 'bg-mine text-bg' : 'text-ink-dim'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2">
          <PointsChart labels={labels} series={series} />
        </div>

        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-ink-dim">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Together */}
      {partner && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-ink-dim">Together</p>
          <p className="mt-1 text-3xl font-bold text-ink">{together}</p>
          <p className="mt-1 text-sm text-ink-dim">
            points earned between you two
          </p>
        </div>
      )}

      {/* Badges */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-dim">Badges</h2>
          <span className="text-xs text-ink-dim">
            {earnedCount}/{badges.length}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border p-3 text-center ${
                b.earned ? 'border-mine/30 bg-mine/10' : 'border-border bg-surface opacity-50'
              }`}
            >
              <p className={`text-2xl ${b.earned ? '' : 'grayscale'}`}>{b.emoji}</p>
              <p className="mt-1 text-xs font-medium text-ink">{b.label}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-ink-dim">
                {b.earned ? 'Earned' : b.hint}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Personal bests */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-ink-dim">Your records</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <RecordCard
            label="Best day"
            value={`${mySummary.best_day_points}`}
            sub={
              mySummary.best_day_date
                ? new Date(`${mySummary.best_day_date}T00:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'
            }
          />
          <RecordCard label="Active days" value={`${mySummary.active_days}`} sub="with points" />
          <RecordCard
            label="Completed"
            value={`${mySummary.total_completions}`}
            sub="all time"
          />
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-dim">{label}</p>
      {sub && <p className="text-[10px] text-ink-dim">{sub}</p>}
    </div>
  )
}

function RecordCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-dim">{label}</p>
      <p className="text-[10px] text-ink-dim">{sub}</p>
    </div>
  )
}

function PersonCard({
  emoji,
  name,
  color,
  total,
  level,
  summary,
}: {
  emoji: string
  name: string
  color: string
  total: number
  level: number
  summary: PointsSummary
}) {
  const { fraction } = levelProgress(total, level)

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</p>
      </div>

      <p className="mt-2 text-xl font-semibold" style={{ color }}>
        {total}
      </p>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full"
          style={{ width: `${fraction * 100}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-dim">
        Lvl {level} · {levelTitle(level)}
      </p>

      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-dim">
        <span>{summary.points_week} this wk</span>
        {summary.best_streak > 0 && <span>🔥 {summary.best_streak}d</span>}
      </div>
    </div>
  )
}
