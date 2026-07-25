import { useId, useMemo } from 'react'

export interface ChartSeries {
  key: string
  label: string
  color: string
  values: number[]
}

const W = 320
const H = 140
const PAD_X = 6
const PAD_TOP = 10
const PAD_BOTTOM = 18

// Catmull-Rom -> cubic bezier, so the trend line reads as a smooth curve
// rather than a jagged polyline. Plain SVG, no charting library (the stack
// is deliberately dependency-light).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

export function PointsChart({
  labels,
  series,
}: {
  labels: string[]
  series: ChartSeries[]
}) {
  const gradId = useId()

  const max = useMemo(() => {
    const all = series.flatMap((s) => s.values)
    return Math.max(10, ...all)
  }, [series])

  const n = labels.length
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_TOP - PAD_BOTTOM

  const toPoints = (values: number[]) =>
    values.map((v, i) => ({
      x: PAD_X + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
      y: PAD_TOP + innerH - (v / max) * innerH,
    }))

  // Only label a handful of x positions so a 90-day range doesn't turn into
  // an unreadable smear of dates.
  const tickEvery = Math.max(1, Math.ceil(n / 6))

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Points over time">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_TOP + innerH - f * innerH}
            y2={PAD_TOP + innerH - f * innerH}
            stroke="var(--color-border)"
            strokeWidth="0.5"
          />
        ))}

        {series.map((s) => {
          const pts = toPoints(s.values)
          const line = smoothPath(pts)
          const area = `${line} L ${pts[pts.length - 1]?.x ?? PAD_X} ${PAD_TOP + innerH} L ${pts[0]?.x ?? PAD_X} ${PAD_TOP + innerH} Z`
          const last = pts[pts.length - 1]
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#${gradId}-${s.key})`} />
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {last && <circle cx={last.x} cy={last.y} r="3" fill={s.color} />}
            </g>
          )
        })}

        {labels.map((label, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={PAD_X + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)}
              y={H - 4}
              textAnchor="middle"
              fontSize="8"
              fill="var(--color-ink-dim)"
            >
              {label}
            </text>
          ) : null,
        )}

        <text x={PAD_X} y={PAD_TOP - 2} fontSize="8" fill="var(--color-ink-dim)">
          {max}
        </text>
      </svg>
    </div>
  )
}
