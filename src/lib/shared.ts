import type { SharedGoal, SharedValueFormat } from './types'

// "$1,000" reads as money; "12 dates" reads as a count. Storing the format
// rather than baking a currency symbol into the unit keeps the number
// sortable and lets the display change without touching the data.
export function formatAmount(
  value: number,
  format: SharedValueFormat,
  unit?: string | null,
): string {
  if (format === 'money') {
    const whole = Math.round(value * 100) / 100
    return `$${whole.toLocaleString(undefined, {
      minimumFractionDigits: whole % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded.toLocaleString()} ${unit}` : rounded.toLocaleString()
}

export function sharedProgress(goal: SharedGoal, total: number): number {
  if (goal.target_value <= 0) return 0
  return Math.max(0, Math.min(1, total / goal.target_value))
}

export function remainingLabel(goal: SharedGoal, total: number): string {
  const left = goal.target_value - total
  if (left <= 0) return 'Done'
  return `${formatAmount(left, goal.value_format, goal.unit)} to go`
}

// Five faces rather than a ten-point scale. Enough range to notice a pattern,
// few enough that picking one is instant and you actually do it every day.
export const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Meh' },
  { value: 3, emoji: '😐', label: 'Fine' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
]

export function moodFor(value: number | null | undefined) {
  return MOODS.find((m) => m.value === value) ?? null
}
