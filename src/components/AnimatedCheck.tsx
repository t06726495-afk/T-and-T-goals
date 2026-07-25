// A drawn checkmark (stroke-dashoffset animated via SVG pathLength=1, so we
// don't need to hand-measure the path length) instead of an instant glyph
// swap. Only animates the draw when `celebrating` is true — a task that's
// already done on page load renders fully drawn with no transition.
export function AnimatedCheck({ done, celebrating }: { done: boolean; celebrating: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1,
          strokeDashoffset: done ? 0 : 1,
          transition: celebrating
            ? 'stroke-dashoffset 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.06s'
            : 'none',
        }}
      />
    </svg>
  )
}
