import { useMemo } from 'react'

const COLORS = ['#22c55e', '#ec4899', '#3b82f6', '#f97316', '#a855f7', '#eab308']

// Small CSS-only confetti burst — no charting/animation library, keeps the
// dependency count down per the project's stack constraints.
export function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5
        const distance = 22 + Math.random() * 18
        return {
          id: i,
          color: COLORS[i % COLORS.length],
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance - 8,
          delay: Math.random() * 0.06,
        }
      }),
    [],
  )

  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
          style={
            {
              backgroundColor: p.color,
              animation: `confetti-burst 0.6s ease-out ${p.delay}s forwards`,
              '--tx': `${p.tx}px`,
              '--ty': `${p.ty}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
