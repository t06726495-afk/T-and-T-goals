// Pure date-math helpers for streaks and the "this week" dots on goal
// cards. Takes a set of YYYY-MM-DD strings that count as "done" for a goal
// and the timezone-correct value of "today".

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function currentStreak(completedDates: Set<string>, today: string): number {
  let cursor = completedDates.has(today) ? today : shiftDate(today, -1)
  let streak = 0
  while (completedDates.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

// Returns the last 7 days (oldest first) as { date, done } for the dot row.
export function lastSevenDays(completedDates: Set<string>, today: string) {
  const days: { date: string; done: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = shiftDate(today, -i)
    days.push({ date, done: completedDates.has(date) })
  }
  return days
}

// Same window, but with a 0..1 fraction per day so counter goals can render
// proportional bars ("half the pages") instead of a binary dot. Checkbox
// goals collapse to 0 or 1.
export function lastSevenDayFractions(
  logs: Map<string, { count: number; completed: boolean }> | undefined,
  today: string,
  target: number | null,
) {
  const days: { date: string; fraction: number; done: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = shiftDate(today, -i)
    const log = logs?.get(date)
    const done = log?.completed ?? false
    let fraction = done ? 1 : 0
    if (target && target > 0 && log) {
      fraction = Math.max(0, Math.min(1, log.count / target))
    }
    days.push({ date, fraction, done })
  }
  return days
}
