// Rotates daily rather than randomly per render, so the quote feels like
// "today's quote" instead of flickering every time the screen re-renders.
// Swap this list for your own any time — nothing else depends on the
// contents.
export const QUOTES: string[] = [
  'Discipline is choosing between what you want now and what you want most.',
  'You do not rise to the level of your goals, you fall to the level of your systems.',
  'Small daily improvements are the key to staggering long-term results.',
  "It's not about being the best. It's about being better than you were yesterday.",
  'Motivation gets you started. Habit keeps you going.',
  "The only workout you'll regret is the one you didn't do.",
  'Consistency beats intensity.',
  'Do something today that your future self will thank you for.',
  'A year from now you will wish you had started today.',
  'Progress, not perfection.',
  'Show up, especially on the days you do not feel like it.',
  'The habit is the point. The result is the byproduct.',
  'Slow progress is still progress.',
  'You are always one decision away from a completely different day.',
  'Fall in love with the process and the results will come.',
]

export function quoteForDate(dateStr: string): string {
  // Simple deterministic hash of YYYY-MM-DD so both partners see the same
  // quote on the same day.
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0
  }
  return QUOTES[hash % QUOTES.length]
}

export function daysTogether(sinceDate: string, todayStr: string): number {
  const [sy, sm, sd] = sinceDate.split('-').map(Number)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const start = Date.UTC(sy, sm - 1, sd)
  const today = Date.UTC(ty, tm - 1, td)
  return Math.max(0, Math.floor((today - start) / 86400000))
}
