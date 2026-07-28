import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  computeBadges,
  badgeSummary,
  TIER_COLORS,
  TIER_ORDER,
  parseSummary,
  EMPTY_SUMMARY,
  type Badge,
  type PointsSummary,
} from '../lib/gamification'

function formatValue(value: number): string {
  return value >= 10000 ? `${Math.floor(value / 1000)}k` : `${value}`
}

export function BadgesPage() {
  const { profile } = useAuth()
  const [summary, setSummary] = useState<PointsSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)

  const profileId = profile?.id

  const load = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase.rpc('points_summary', { p_profile_id: profileId })
    setSummary(parseSummary(data))
    setLoading(false)
  }, [profileId])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile || loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  const badges = computeBadges(profile.points_total, profile.current_level, summary)
  const { tiersEarned, tiersTotal } = badgeSummary(badges)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/points" className="text-sm text-ink-dim">
        ← Points
      </Link>

      <h1 className="mt-2 text-3xl font-semibold text-ink">Badges</h1>
      <p className="mt-1 text-sm text-ink-dim">
        {tiersEarned} of {tiersTotal} tiers earned. Every badge keeps going: clear a tier
        and the next one opens up.
      </p>

      <div className="mt-5 space-y-3">
        {badges.map((badge) => (
          <BadgeRow key={badge.id} badge={badge} />
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-ink-dim">
        {TIER_ORDER.map((tier, i) => (
          <span key={tier}>
            {i > 0 && <span className="mx-1 opacity-40">→</span>}
            <span style={{ color: TIER_COLORS[tier] }}>{tier}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

function BadgeRow({ badge }: { badge: Badge }) {
  const color = badge.tier ? TIER_COLORS[badge.tier] : 'var(--color-border)'
  const earned = badge.tierIndex >= 0

  return (
    <div
      className="rounded-2xl border bg-surface p-4"
      style={{ borderColor: earned ? `color-mix(in srgb, ${color} 45%, transparent)` : undefined }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
          style={{
            backgroundColor: earned
              ? `color-mix(in srgb, ${color} 20%, transparent)`
              : 'var(--color-surface-raised)',
          }}
        >
          <span className={earned ? '' : 'opacity-40 grayscale'}>{badge.emoji}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium text-ink">{badge.label}</p>
            <p className="shrink-0 text-xs font-medium" style={{ color: earned ? color : undefined }}>
              {badge.tier ?? 'Locked'}
            </p>
          </div>
          <p className="text-sm text-ink-dim">
            {formatValue(badge.value)}
            {badge.unit && ` ${badge.unit}`}
          </p>
        </div>
      </div>

      {/* Tier pips make the whole ladder visible at a glance, so you can see
          how far a badge still goes rather than just the next step. */}
      <div className="mt-3 flex gap-1">
        {TIER_ORDER.map((tier, i) => (
          <div
            key={tier}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised"
            title={tier}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:
                  i < badge.tierIndex
                    ? '100%'
                    : i === badge.tierIndex + 1
                      ? `${badge.progress * 100}%`
                      : i === badge.tierIndex
                        ? '100%'
                        : '0%',
                backgroundColor: TIER_COLORS[tier],
              }}
            />
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-dim">
        {badge.maxed
          ? 'Maxed out. Nothing left to prove here.'
          : `${formatValue(Math.max(0, (badge.nextThreshold ?? 0) - badge.value))} more for ${
              TIER_ORDER[badge.tierIndex + 1]
            }`}
      </p>
    </div>
  )
}
