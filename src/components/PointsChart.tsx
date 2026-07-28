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

// Monotone cubic interpolation (Fritsch-Carlson), rendered as cubic beziers.
//
// The obvious choice here is Catmull-Rom, and it was what this used, but
// Catmull-Rom overshoots: after a flat run followed by a jump, it dips BELOW
// the flat part before climbing and then arcs above the peak before settling.
// On a running points total that's a curve claiming you lost points you never
// lost. Fritsch-Carlson limits the tangents so the curve can never leave the
// range of the data it connects. Flat stays flat, and a rise only rises.
//
// Plain SVG, no charting library: the stack is deliberately dependency-light.
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`

  // Secant slope of each segment.
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x
    slopes.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx)
  }

  // Start with the average of the neighbouring secants at each interior point.
  const tangents: number[] = new Array(n)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let i = 1; i < n - 1; i++) {
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2
  }

  // Then rein them in. A flat segment pins both its tangents to zero, and the
  // circle constraint keeps the rest inside the monotone region.
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / slopes[i]
    const b = tangents[i + 1] / slopes[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      tangents[i] = t * a * slopes[i]
      tangents[i + 1] = t * b * slopes[i]
    }
  }

  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x
    const c1x = pts[i].x + dx / 3
    const c1y = pts[i].y + (tangents[i] * dx) / 3
    const c2x = pts[i + 1].x - dx / 3
    const c2y = pts[i + 1].y - (tangents[i + 1] * dx) / 3
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`
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
