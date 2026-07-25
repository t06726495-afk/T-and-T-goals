export interface PointsSummary {
  points_today: number
  points_week: number
  points_prev_week: number
  best_day_points: number
  best_day_date: string | null
  active_days: number
  total_completions: number
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

export interface Badge {
  id: string
  emoji: string
  label: string
  hint: string
  earned: boolean
}

export function computeBadges(
  total: number,
  level: number,
  summary: PointsSummary,
): Badge[] {
  return [
    {
      id: 'first',
      emoji: '🌱',
      label: 'First step',
      hint: 'Complete anything once',
      earned: summary.total_completions >= 1,
    },
    {
      id: 'week-streak',
      emoji: '🔥',
      label: 'Week strong',
      hint: 'Hold a 7 day streak',
      earned: summary.best_streak >= 7,
    },
    {
      id: 'points-100',
      emoji: '⚡',
      label: '100 club',
      hint: 'Earn 100 points',
      earned: total >= 100,
    },
    {
      id: 'active-14',
      emoji: '📅',
      label: 'Regular',
      hint: 'Be active 14 days',
      earned: summary.active_days >= 14,
    },
    {
      id: 'level-5',
      emoji: '🏅',
      label: 'Level 5',
      hint: 'Reach level 5',
      earned: level >= 5,
    },
    {
      id: 'month-streak',
      emoji: '💎',
      label: 'Month strong',
      hint: 'Hold a 30 day streak',
      earned: summary.best_streak >= 30,
    },
    {
      id: 'points-500',
      emoji: '🚀',
      label: '500 club',
      hint: 'Earn 500 points',
      earned: total >= 500,
    },
    {
      id: 'century',
      emoji: '💯',
      label: 'Century',
      hint: 'Complete 100 things',
      earned: summary.total_completions >= 100,
    },
    {
      id: 'level-10',
      emoji: '👑',
      label: 'Level 10',
      hint: 'Reach level 10',
      earned: level >= 10,
    },
  ]
}
