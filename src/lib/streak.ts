// Pure date-math helpers for streaks and the "this week" dots on goal
// cards. Takes a set of YYYY-MM-DD strings that count as "done" for a goal
// and the timezone-correct value of "today".

function shiftDate(dateStr: string, days: number): string {
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
