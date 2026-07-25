// Returns YYYY-MM-DD for "today" in the given IANA timezone (not UTC, not
// necessarily the browser's local date if the user travels or picks a
// different timezone in Settings than their device is set to).
export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function dayOfWeekInTimezone(timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(new Date())
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days.indexOf(weekday)
}

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  any: 'Anytime',
}

export function timeOfDayLabel(value: string): string {
  return TIME_OF_DAY_LABELS[value] ?? value
}
