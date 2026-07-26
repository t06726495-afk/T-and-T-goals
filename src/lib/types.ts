export interface Profile {
  id: string
  display_name: string
  avatar_emoji: string
  accent_color: string | null
  timezone: string
  points_total: number
  current_level: number
  created_at: string
}

export interface CoupleInfo {
  couple_id: string
  invite_code: string
  member_count: number
}

export type GoalKind = 'checkbox' | 'counter'
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard'
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any'
export type Visibility = 'shared' | 'private'

export interface Goal {
  id: string
  owner_id: string
  couple_id: string
  title: string
  emoji: string
  color: string
  kind: GoalKind
  target_per_day: number | null
  unit: string | null
  difficulty: Difficulty
  category: string | null
  visibility: Visibility
  is_active: boolean
  sort_order: number
  created_at: string
  archived_at: string | null
}

export interface GoalLog {
  id: string
  goal_id: string
  owner_id: string
  log_date: string
  count: number
  completed: boolean
  points_awarded: number
  created_at: string
}

export interface TaskTemplate {
  id: string
  owner_id: string
  goal_id: string | null
  title: string
  difficulty: Difficulty
  days_of_week: number[]
  time_of_day: TimeOfDay
  is_active: boolean
  source: 'manual' | 'ai'
  created_at: string
}

export interface Task {
  id: string
  owner_id: string
  template_id: string | null
  goal_id: string | null
  title: string
  task_date: string
  difficulty: Difficulty
  time_of_day: TimeOfDay
  done: boolean
  done_at: string | null
  points_awarded: number
  created_at: string
}

export type BenchmarkDirection = 'higher' | 'lower'
export type ValueFormat = 'number' | 'time'

export interface Benchmark {
  id: string
  owner_id: string
  couple_id: string
  goal_id: string | null
  title: string
  emoji: string
  color: string
  unit: string | null
  direction: BenchmarkDirection
  value_format: ValueFormat
  start_value: number | null
  target_value: number
  best_value: number | null
  difficulty: Difficulty
  visibility: Visibility
  is_active: boolean
  achieved_at: string | null
  points_awarded: number
  created_at: string
  archived_at: string | null
}

export interface BenchmarkEntry {
  id: string
  benchmark_id: string
  owner_id: string
  value: number
  recorded_on: string
  note: string | null
  created_at: string
}
