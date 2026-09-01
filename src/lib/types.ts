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
  notes: string | null
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
  notes: string | null
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

export type SharedValueFormat = 'number' | 'money'

export interface SharedGoal {
  id: string
  couple_id: string
  created_by: string
  title: string
  emoji: string
  color: string
  target_value: number
  unit: string | null
  value_format: SharedValueFormat
  difficulty: Difficulty
  is_active: boolean
  achieved_at: string | null
  created_at: string
  archived_at: string | null
}

export interface SharedGoalEntry {
  id: string
  shared_goal_id: string
  owner_id: string
  amount: number
  note: string | null
  recorded_on: string
  is_bonus: boolean
  points_awarded: number
  created_at: string
}

export interface JournalEntry {
  id: string
  owner_id: string
  entry_date: string
  body: string | null
  mood: number | null
  visibility: Visibility
  points_awarded: number
  created_at: string
  updated_at: string
}
