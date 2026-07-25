export const EMOJI_CHOICES = ['🙂', '😎', '🥰', '🔥', '🌱', '💪', '🐶', '🐱', '⭐', '🎯']

export const COLOR_CHOICES = [
  '#22c55e',
  '#ec4899',
  '#3b82f6',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#ef4444',
  '#eab308',
]

export const GOAL_EMOJI_CHOICES = [
  '🎯',
  '💪',
  '📚',
  '💧',
  '🏃',
  '🧘',
  '🥗',
  '😴',
  '💰',
  '🎨',
  '🧹',
  '🙏',
]

export const DIFFICULTY_OPTIONS: {
  value: 'trivial' | 'easy' | 'medium' | 'hard'
  label: string
  points: number
}[] = [
  { value: 'trivial', label: 'Trivial', points: 1 },
  { value: 'easy', label: 'Easy', points: 10 },
  { value: 'medium', label: 'Medium', points: 15 },
  { value: 'hard', label: 'Hard', points: 20 },
]

export const UNIT_PRESETS = [
  'glasses',
  'minutes',
  'hours',
  'pages',
  'reps',
  'steps',
  'times',
]

export const TITLE_PLACEHOLDER = 'Workout, Reading, Drink water…'
