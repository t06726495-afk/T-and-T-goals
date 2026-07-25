import { shiftDate } from './streak'

export interface YearGridCell {
  date: string | null // YYYY-MM-DD, or null for padding outside the year
  isFuture: boolean
  isToday: boolean
}

export interface MonthLabel {
  weekIndex: number
  label: string
}

const WEEKS = 53
const DAYS = 7

// GitHub-style layout: 53 columns (weeks, Sunday-start), 7 rows. Starts on
// the Sunday on/before Jan 1 so the grid always fully covers the year.
export function buildYearGrid(
  year: number,
  todayStr: string,
): { weeks: YearGridCell[][]; monthLabels: MonthLabel[] } {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const startDow = jan1.getUTCDay()
  const start = new Date(jan1)
  start.setUTCDate(start.getUTCDate() - startDow)

  const weeks: YearGridCell[][] = []
  const monthLabels: MonthLabel[] = []

  for (let w = 0; w < WEEKS; w++) {
    const col: YearGridCell[] = []
    let newMonthLabel = ''

    for (let d = 0; d < DAYS; d++) {
      const cur = new Date(start)
      cur.setUTCDate(start.getUTCDate() + w * DAYS + d)
      const dateStr = cur.toISOString().slice(0, 10)
      const inYear = cur.getUTCFullYear() === year

      col.push({
        date: inYear ? dateStr : null,
        isFuture: dateStr > todayStr,
        isToday: inYear && dateStr === todayStr,
      })

      if (inYear && cur.getUTCDate() === 1) {
        newMonthLabel = cur.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      }
    }

    weeks.push(col)
    if (newMonthLabel) monthLabels.push({ weekIndex: w, label: newMonthLabel })
  }

  return { weeks, monthLabels }
}

export function longestStreak(completedDates: Set<string>, year: number, todayStr: string): number {
  const currentYear = Number(todayStr.slice(0, 4))
  const endDate = year >= currentYear ? todayStr : `${year}-12-31`
  let cursor = `${year}-01-01`
  let longest = 0
  let run = 0

  while (cursor <= endDate) {
    if (completedDates.has(cursor)) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
    cursor = shiftDate(cursor, 1)
  }

  return longest
}

export function daysElapsedInYear(year: number, todayStr: string): number {
  const currentYear = Number(todayStr.slice(0, 4))
  if (year < currentYear) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return isLeap ? 366 : 365
  }
  if (year > currentYear) return 0

  const [ty, tm, td] = todayStr.split('-').map(Number)
  const jan1 = Date.UTC(year, 0, 1)
  const today = Date.UTC(ty, tm - 1, td)
  return Math.floor((today - jan1) / 86400000) + 1
}

export function counterIntensity(count: number, target: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  const pct = count / target
  if (pct < 0.5) return 1
  if (pct < 1) return 2
  return 3
}
