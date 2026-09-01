import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { levelProgress, levelThreshold } from '../lib/levels'
import {
  badgeSummary,
  computeBadges,
  levelTitle,
  parseSummary,
  EMPTY_SUMMARY,
  TIER_COLORS,
  type PointsSummary,
} from '../lib/gamification'
import { PointsChart, type ChartSeries } from '../components/PointsChart'
import { PageHeader } from '../components/PageHeader'
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

// The history RPC returns points *earned per day*. To race each other on
// all-time totals we need the running total instead, so we work backwards
// from the stored lifetime total: everything before this window is
// (total - what the window contains), then accumulate forward.
function cumulative(daily: number[], allTimeTotal: number): number[] {
  const windowSum = daily.reduce((a, b) => a + b, 0)
  let running = allTimeTotal - windowSum
  return daily.map((v) => {
    running += v
    return running
  })
}

export function PointsPage() {
  const { profile, refreshProfile } = useAuth()
  const [partner, setPartner] = useState<Profile | null>(null)
  const [days, setDays] = useState(30)
  // Total is the default: a line that only climbs is the one that reads as
  // progress. Daily is still there for "how was Tuesday".
  const [mode, setMode] = useState<'daily' | 'total'>('total')
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
        <h1 className="text-3xl font-semibold text-ink">Points</h1>
        <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-ink">
          {error}
        </div>
      </div>
    )
  }

  const { fraction } = levelProgress(profile.points_total, profile.current_level)
  const toNext = Math.max(0, levelThreshold(profile.current_level + 1) - profile.points_total)
  const badges = computeBadges(profile.points_total, profile.current_level, mySummary)
  const { tiersEarned, tiersTotal } = badgeSummary(badges)
  const topBadges = [...badges].sort((a, b) => b.tierIndex - a.tierIndex).slice(0, 4)
  const weekDelta = mySummary.points_week - mySummary.points_prev_week
  const together = profile.points_total + (partner?.points_total ?? 0)

  const labels = myHistory.map((d) => {
    const date = new Date(`${d.day}T00:00:00`)
    return days <= 7
      ? date.toLocaleDateString(undefined, { weekday: 'narrow' })
      : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  })
  const fullLabels = myHistory.map((d) =>
    new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  )

  const myDaily = myHistory.map((d) => d.points)
  const partnerDaily = partnerHistory.map((d) => d.points)

  const series: ChartSeries[] = [
    {
      key: 'mine',
      label: profile.display_name,
      color: 'var(--color-mine)',
      values: mode === 'total' ? cumulative(myDaily, profile.points_total) : myDaily,
    },
  ]
  if (partner && partnerHistory.length === myHistory.length) {
    series.push({
      key: 'partner',
      label: partner.display_name,
      color: 'var(--color-partner)',
      values: mode === 'total' ? cumulative(partnerDaily, partner.points_total) : partnerDaily,
    })
  }

  // In total mode the interesting number is the gap between the two curves,
  // not who is "winning" — framed as a distance so it reads as a race you're
  // both running, not a scoreboard.
  const gap = partner ? Math.abs(profile.points_total - partner.points_total) : 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Points" subtitle="How you're both doing." />

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
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode('daily')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode === 'daily' ? 'bg-mine text-bg' : 'text-ink-dim'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setMode('total')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode === 'total' ? 'bg-mine text-bg' : 'text-ink-dim'
              }`}
            >
              Total
            </button>
          </div>
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
          <PointsChart
            labels={labels}
            fullLabels={fullLabels}
            series={series}
            zeroBased={mode === 'daily'}
          />
        </div>

        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-ink-dim">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>

        {mode === 'total' && partner && (
          <p className="mt-2 text-center text-xs text-ink-dim">
            {gap === 0
              ? "Dead even. Somehow you're both on exactly the same number."
              : `${gap} points between the two lines.`}
          </p>
        )}
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

      {/* Badges — a door, not a grid. The full ladder lives on its own screen
          so it has room to show tiers and progress. */}
      <Link
        to="/badges"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors active:bg-surface-raised"
      >
        <div className="flex -space-x-2">
          {topBadges.map((b) => (
            <span
              key={b.id}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-lg ${
                b.tierIndex >= 0 ? '' : 'opacity-40 grayscale'
              }`}
              style={{
                backgroundColor: b.tier
                  ? `color-mix(in srgb, ${TIER_COLORS[b.tier]} 25%, var(--color-surface-raised))`
                  : 'var(--color-surface-raised)',
              }}
            >
              {b.emoji}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">Badges</p>
          <p className="text-sm text-ink-dim">
            {tiersEarned} of {tiersTotal} tiers earned
          </p>
        </div>
        <span className="text-ink-dim">›</span>
      </Link>

      {/* Personal bests */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-ink-dim">Your records</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <RecordCard
            label="Days in a row"
            value={`${mySummary.longest_active_days}`}
            sub="most ever"
          />
          <RecordCard
            label="Benchmarks"
            value={`${mySummary.benchmarks_hit}`}
            sub="targets hit"
          />
          <RecordCard
            label="Completed"
            value={`${mySummary.completion_pct}%`}
            sub="of goal days"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
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
