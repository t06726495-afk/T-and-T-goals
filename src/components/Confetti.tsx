import { useMemo } from 'react'
import { prefersReducedMotion } from '../lib/motion'

const COLORS = ['#22c55e', '#ec4899', '#3b82f6', '#f97316', '#a855f7', '#eab308']

interface Particle {
  id: number
  color: string
  size: number
  left: number
  top: number
  tx: number
  ty: number
  delay: number
}

// Spawns particles from points walked around the parent's border (biased
// toward the long top/bottom edges since rows are wide and short) rather
// than a single center point, so the burst reads as "the whole card is
// celebrating" instead of "something popped near the checkbox." Overflow
// onto neighboring rows is intentional — it's a big, brief celebration.
function buildPerimeterParticles(count: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    let left: number
    let top: number
    let nx: number
    let ny: number

    if (t < 0.4) {
      left = 5 + (t / 0.4) * 90
      top = 0
      nx = (Math.random() - 0.5) * 0.7
      ny = -1
    } else if (t < 0.8) {
      const u = (t - 0.4) / 0.4
      left = 5 + u * 90
      top = 100
      nx = (Math.random() - 0.5) * 0.7
      ny = 1
    } else if (t < 0.9) {
      const u = (t - 0.8) / 0.1
      left = 0
      top = 15 + u * 70
      nx = -1
      ny = (Math.random() - 0.5) * 0.7
    } else {
      const u = (t - 0.9) / 0.1
      left = 100
      top = 15 + u * 70
      nx = 1
      ny = (Math.random() - 0.5) * 0.7
    }

    const distance = 24 + Math.random() * 30
    particles.push({
      id: i,
      color: COLORS[i % COLORS.length],
      size: Math.random() > 0.5 ? 7 : 5,
      left,
      top,
      tx: nx * distance,
      ty: ny * distance,
      delay: Math.random() * 0.12,
    })
  }
  return particles
}

// Small CSS-only confetti burst — no charting/animation library, keeps the
// dependency count down per the project's stack constraints.
export function Confetti() {
  const particles = useMemo(() => buildPerimeterParticles(22), [])

  if (prefersReducedMotion()) return null

  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={
            {
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: `confetti-burst 0.7s cubic-bezier(0.11, 0.83, 0.38, 0.96) ${p.delay}s forwards`,
              '--tx': `${p.tx}px`,
              '--ty': `${p.ty}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
