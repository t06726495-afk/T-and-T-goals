import { useMemo } from 'react'
import { prefersReducedMotion } from '../lib/motion'

const COLORS = ['#22c55e', '#ec4899', '#3b82f6', '#f97316', '#a855f7', '#eab308']

// Small CSS-only confetti burst — no charting/animation library, keeps the
// dependency count down per the project's stack constraints.
export function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4
        const distance = 26 + Math.random() * 22
        return {
          id: i,
          color: COLORS[i % COLORS.length],
          size: Math.random() > 0.5 ? 6 : 4,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance - 10,
          delay: Math.random() * 0.08,
        }
      }),
    [],
  )

  if (prefersReducedMotion()) return null

  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={
            {
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: `confetti-burst 0.65s cubic-bezier(0.11, 0.83, 0.38, 0.96) ${p.delay}s forwards`,
              '--tx': `${p.tx}px`,
              '--ty': `${p.ty}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
