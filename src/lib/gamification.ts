export interface PointsSummary {
  points_today: number
  points_week: number
  points_prev_week: number
  best_day_points: number
  best_day_date: string | null
  active_days: number
  total_completions: number
  benchmarks_hit: number
  longest_active_days: number
  completion_pct: number
  best_streak: number
}

export const EMPTY_SUMMARY: PointsSummary = {
  points_today: 0,
  points_week: 0,
  points_prev_week: 0,
  best_day_points: 0,
  best_day_date: null,
  active_days: 0,
  total_completions: 0,
  benchmarks_hit: 0,
  longest_active_days: 0,
  completion_pct: 0,
  best_streak: 0,
}

export function parseSummary(raw: unknown): PointsSummary {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    points_today: Number(r.points_today ?? 0),
    points_week: Number(r.points_week ?? 0),
    points_prev_week: Number(r.points_prev_week ?? 0),
    best_day_points: Number(r.best_day_points ?? 0),
    best_day_date: (r.best_day_date as string | null) ?? null,
    active_days: Number(r.active_days ?? 0),
    total_completions: Number(r.total_completions ?? 0),
    benchmarks_hit: Number(r.benchmarks_hit ?? 0),
    longest_active_days: Number(r.longest_active_days ?? 0),
    completion_pct: Number(r.completion_pct ?? 0),
    best_streak: Number(r.best_streak ?? 0),
  }
}

// Rank names give each level a bit of identity beyond a bare number. Kept
// encouraging on purpose — the whole points system is deliberately
// no-penalty, so the labels shouldn't imply falling behind either.
const RANKS: { min: number; title: string }[] = [
  { min: 30, title: 'Legend' },
  { min: 22, title: 'Unstoppable' },
  { min: 16, title: 'Machine' },
  { min: 11, title: 'Relentless' },
  { min: 7, title: 'Committed' },
  { min: 4, title: 'Consistent' },
  { min: 2, title: 'Warming up' },
  { min: 1, title: 'Getting started' },
]

export function levelTitle(level: number): string {
  return RANKS.find((r) => level >= r.min)?.title ?? 'Getting started'
}

// ---------------------------------------------------------------------------
// Badges
//
// Each badge is one long-running pursuit with escalating tiers, rather than a
// one-and-done sticker. That way a badge keeps giving you something to aim at
// instead of going dead the moment it unlocks.
// ---------------------------------------------------------------------------

export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond'

export const TIER_ORDER: TierName[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']

export const TIER_COLORS: Record<TierName, string> = {
  Bronze: '#b87333',
  Silver: '#b5bcc4',
  Gold: '#e0b13a',
  Platinum: '#8fd3d0',
  Diamond: '#9fa8ff',
}

export interface BadgeDef {
  id: string
  emoji: string
  label: string
  unit: string // e.g. "points", "days"
  thresholds: number[] // one per tier, ascending
  value: (s: PointsSummary, total: number, level: number) => number
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'level',
    emoji: '🏅',
    label: 'Level',
    unit: '',
    thresholds: [5, 10, 25, 50, 100],
    value: (_s, _t, level) => level,
  },
  {
    id: 'points',
    emoji: '⚡',
    label: 'Points',
    unit: 'pts',
    thresholds: [100, 500, 2000, 10000, 50000],
    value: (_s, total) => total,
  },
  {
    id: 'streak',
    emoji: '🔥',
    label: 'Streak',
    unit: 'days',
    thresholds: [7, 30, 100, 250, 365],
    value: (s) => s.best_streak,
  },
  {
    id: 'consistency',
    emoji: '📅',
    label: 'Consistency',
    unit: 'days',
    thresholds: [7, 30, 100, 250, 500],
    value: (s) => s.longest_active_days,
  },
  {
    id: 'completions',
    emoji: '💯',
    label: 'Completed',
    unit: '',
    thresholds: [10, 100, 500, 2000, 10000],
    value: (s) => s.total_completions,
  },
  {
    id: 'benchmarks',
    emoji: '🏆',
    label: 'Benchmarks',
    unit: 'hit',
    thresholds: [1, 5, 15, 40, 100],
    value: (s) => s.benchmarks_hit,
  },
]

export interface Badge {
  id: string
  emoji: string
  label: string
  unit: string
  value: number
  /** null until the first threshold is reached. */
  tier: TierName | null
  tierIndex: number // -1 when unearned
  nextThreshold: number | null // null once maxed
  /** 0..1 toward the next tier. */
  progress: number
  maxed: boolean
}

export function computeBadges(total: number, level: number, summary: PointsSummary): Badge[] {
  return BADGE_DEFS.map((def) => {
    const value = def.value(summary, total, level)

    // Highest threshold cleared.
    let tierIndex = -1
    for (let i = 0; i < def.thresholds.length; i++) {
      if (value >= def.thresholds[i]) tierIndex = i
    }

    const maxed = tierIndex === def.thresholds.length - 1
    const nextThreshold = maxed ? null : def.thresholds[tierIndex + 1]
    const floor = tierIndex >= 0 ? def.thresholds[tierIndex] : 0
    const progress =
      nextThreshold === null
        ? 1
        : Math.max(0, Math.min(1, (value - floor) / (nextThreshold - floor)))

    return {
      id: def.id,
      emoji: def.emoji,
      label: def.label,
      unit: def.unit,
      value,
      tier: tierIndex >= 0 ? TIER_ORDER[tierIndex] : null,
      tierIndex,
      nextThreshold,
      progress,
      maxed,
    }
  })
}

export function badgeSummary(badges: Badge[]) {
  const earned = badges.filter((b) => b.tierIndex >= 0).length
  // Total tiers cleared across every badge — a better sense of overall
  // progress than "3 of 6 badges" once tiers exist.
  const tiersEarned = badges.reduce((sum, b) => sum + (b.tierIndex + 1), 0)
  const tiersTotal = badges.length * TIER_ORDER.length
  return { earned, total: badges.length, tiersEarned, tiersTotal }
}
