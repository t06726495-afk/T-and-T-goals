export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Small shared vocabulary so a tap, a completion, and a milestone don't all
// feel identical. navigator.vibrate is a no-op on iOS Safari, so this is
// additive on Android and harmless everywhere else.
const PATTERNS: Record<'tick' | 'done' | 'celebrate', number | number[]> = {
  tick: 10, // incremental tap (+1 on a counter)
  done: 15, // finished a task
  celebrate: [15, 40, 25], // hit a target or benchmark
}

export function haptic(kind: keyof typeof PATTERNS) {
  if (prefersReducedMotion()) return
  navigator.vibrate?.(PATTERNS[kind])
}
