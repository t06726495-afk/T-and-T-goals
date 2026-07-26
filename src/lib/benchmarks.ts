import type { Benchmark, ValueFormat } from './types'

// Time benchmarks (mile splits, plank holds) are stored as seconds and
// shown as m:ss, so "sub 7:30" is a target of 450 rather than 7.5.
export function formatValue(
  value: number | null | undefined,
  format: ValueFormat,
  unit?: string | null,
): string {
  if (value === null || value === undefined) return '—'

  if (format === 'time') {
    const total = Math.max(0, Math.round(value))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
}

// Accepts "7:30" or "450" for time, plain numbers otherwise. Returns null
// when the input isn't parseable so callers can show a validation message
// instead of silently writing NaN.
export function parseValue(input: string, format: ValueFormat): number | null {
  const raw = input.trim()
  if (!raw) return null

  if (format === 'time' && raw.includes(':')) {
    const [m, s] = raw.split(':')
    const mins = Number(m)
    const secs = Number(s)
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null
    return mins * 60 + secs
  }

  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function isAchieved(b: Benchmark): boolean {
  return b.achieved_at !== null
}

// 0..1 progress from the starting measurement toward the target. Returns
// null when there's nothing logged yet (so the UI can say "no data" rather
// than draw a misleading empty bar).
export function benchmarkProgress(b: Benchmark): number | null {
  if (b.best_value === null || b.best_value === undefined) return null

  const start = b.start_value
  if (start === null || start === undefined) {
    return isAchieved(b) ? 1 : 0
  }

  const span = b.direction === 'lower' ? start - b.target_value : b.target_value - start
  if (span <= 0) {
    // Target was already met (or beyond) at the starting point.
    return 1
  }

  const gained = b.direction === 'lower' ? start - b.best_value : b.best_value - start
  return Math.max(0, Math.min(1, gained / span))
}

export function remainingLabel(b: Benchmark): string {
  if (isAchieved(b)) return 'Hit it'
  if (b.best_value === null || b.best_value === undefined) return 'No data yet'

  const gap =
    b.direction === 'lower' ? b.best_value - b.target_value : b.target_value - b.best_value

  if (gap <= 0) return 'Hit it'
  return `${formatValue(gap, b.value_format, b.unit)} to go`
}

export const UNIT_PRESETS_BENCHMARK = ['lbs', 'kg', 'reps', 'miles', 'km', 'min/mile', '%']
