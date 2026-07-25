// Mirrors the Postgres level_for_points formula: level L is entered at
// cumulative points 25*(L-1)*L (so level 1 starts at 0, level 2 at 50,
// level 3 at 150, ...).
export function levelThreshold(level: number): number {
  return 25 * (level - 1) * level
}

export function levelProgress(points: number, level: number) {
  const floor = levelThreshold(level)
  const next = levelThreshold(level + 1)
  const fraction = next > floor ? Math.min(1, Math.max(0, (points - floor) / (next - floor))) : 1
  return { floor, next, fraction }
}
