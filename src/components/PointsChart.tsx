import { useId, useMemo, useRef, useState } from 'react'

export interface ChartSeries {
  key: string
  label: string
  color: string
  values: number[]
}

const W = 320
const H = 150
const PAD_X = 6
const PAD_TOP = 12
const PAD_BOTTOM = 20

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
  fullLabels,
  zeroBased = true,
}: {
  labels: string[]
  series: ChartSeries[]
  /** Longer labels used in the scrub readout, e.g. "Mar 4". */
  fullLabels?: string[]
  /**
   * Anchor the axis at zero. Right for daily points. Wrong for a running
   * lifetime total, where every value sits near the same large number and a
   * zero floor squashes the whole climb into a flat line.
   */
  zeroBased?: boolean
}) {
  const gradId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.values)
    if (all.length === 0) return { min: 0, max: 10 }
    const hi = Math.max(...all)
    if (zeroBased) return { min: 0, max: Math.max(10, hi) }
    const lo = Math.min(...all)
    // Pad the floor so the lowest point isn't welded to the axis line.
    const span = Math.max(1, hi - lo)
    return { min: Math.max(0, lo - span * 0.15), max: Math.max(hi, lo + 1) }
  }, [series, zeroBased])

  const n = labels.length
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const range = Math.max(1, max - min)

  const xFor = (i: number) => PAD_X + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yFor = (v: number) => PAD_TOP + innerH - ((v - min) / range) * innerH

  const toPoints = (values: number[]) => values.map((v, i) => ({ x: xFor(i), y: yFor(v) }))

  const tickEvery = Math.max(1, Math.ceil(n / 6))

  // Map a pointer position to the nearest data index. Uses the SVG's own
  // bounding box so it stays correct however the chart is scaled.
  function indexFromEvent(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || n === 0) return null
    const ratio = (clientX - rect.left) / rect.width
    const svgX = ratio * W
    const i = Math.round(((svgX - PAD_X) / innerW) * (n - 1))
    return Math.max(0, Math.min(n - 1, i))
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="Points over time"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setActive(indexFromEvent(e.clientX))
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === 'mouse') return
          setActive(indexFromEvent(e.clientX))
        }}
        onPointerUp={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
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

        {/* Scrub line and per-series dots at the touched day. */}
        {active !== null && (
          <g pointerEvents="none">
            <line
              x1={xFor(active)}
              x2={xFor(active)}
              y1={PAD_TOP}
              y2={PAD_TOP + innerH}
              stroke="var(--color-ink-dim)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={xFor(active)}
                cy={yFor(s.values[active] ?? 0)}
                r="4"
                fill={s.color}
                stroke="var(--color-surface)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}

        {labels.map((label, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={xFor(i)}
              y={H - 5}
              textAnchor="middle"
              fontSize="8"
              fill="var(--color-ink-dim)"
            >
              {label}
            </text>
          ) : null,
        )}

        <text x={PAD_X} y={PAD_TOP - 3} fontSize="8" fill="var(--color-ink-dim)">
          {Math.round(max)}
        </text>
        {/* Only worth printing when the axis doesn't start at zero, otherwise
            it's a label saying "0" for no reason. */}
        {min > 0 && (
          <text x={PAD_X} y={PAD_TOP + innerH + 8} fontSize="8" fill="var(--color-ink-dim)">
            {Math.round(min)}
          </text>
        )}
      </svg>

      {/* Readout sits below the chart rather than floating over it, so it
          never ends up under the finger that's scrubbing. Reserves its own
          height so the layout doesn't jump when it appears. */}
      <div className="mt-1 flex min-h-[20px] items-center justify-center gap-3 text-xs">
        {active !== null ? (
          <>
            <span className="text-ink-dim">{fullLabels?.[active] ?? labels[active]}</span>
            {series.map((s) => (
              <span key={s.key} className="font-medium" style={{ color: s.color }}>
                {s.values[active] ?? 0}
              </span>
            ))}
          </>
        ) : (
          <span className="text-ink-dim">Touch the chart to see any day</span>
        )}
      </div>
    </div>
  )
}
