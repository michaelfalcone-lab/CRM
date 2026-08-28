import type { ContactResponseRateResult } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import { VIZ_AXIS_TEXT, VIZ_CHART_WELL_BG, VIZ_GREEN, VIZ_GRID_LINE, VIZ_MID_GRAY } from './theme'
import styles from './WinRateGauge.module.css'

export interface WinRateGaugeProps {
  result: ContactResponseRateResult
}

/** Gauge sweep: a 240° arc opening downward, so the needle's rest
 * position (0%) is bottom-left and full (100%) is bottom-right — the
 * conventional dial reading, rather than a full circle where start and
 * end coincide and the value becomes ambiguous. */
const START_ANGLE = 150
const SWEEP = 240
const MAJOR_TICKS = 5 // 0, 25, 50, 75, 100
const MINOR_PER_MAJOR = 4

/* Radii are laid out from the outside in, and must not overlap: scale
 * labels sit outside the ticks, ticks outside the arc, and the arc
 * outside the hub where the percentage readout goes. An earlier version
 * put the labels at r=64 while the arc occupied r=66..82, so every number
 * rendered on top of the arc. */
const SIZE = 200
const CENTER = SIZE / 2
const R_LABEL = 92
const R_TICK_OUTER = 80
const R_TICK_INNER_MAJOR = 68
const R_TICK_INNER_MINOR = 74
const R_ARC = 54
const R_ARC_WIDTH = 14
const R_NEEDLE_INNER = 26

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) }
}

/** SVG arc path between two angles at a given radius. */
function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const a = polar(fromDeg, radius)
  const b = polar(toDeg, radius)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x} ${b.y}`
}

/**
 * The Win Rate dial: what share of the team's contacts have actually
 * responded to outreach.
 *
 * Hand-built SVG rather than a Recharts primitive because Recharts has no
 * gauge with tick marks — its radial types draw bare arcs, which is what
 * the previous donut version was. The spokes are the point of the
 * redesign: a bare arc shows a proportion, a ticked dial shows a
 * *reading*, so a rate can be judged at a glance against the scale rather
 * than by mentally estimating arc length.
 *
 * `rate === null` (no contacts at all) renders the dial with no needle and
 * an explicit "No contacts yet" — never a 0% needle, which would read as
 * "nobody responds" rather than "nothing to measure".
 */
export function WinRateGauge({ result }: WinRateGaugeProps) {
  const { respondedCount, totalCount, rate } = result
  const hasData = rate !== null
  const valueAngle = START_ANGLE + SWEEP * (rate ?? 0)

  const ticks: { angle: number; major: boolean; label?: string }[] = []
  const totalTicks = (MAJOR_TICKS - 1) * MINOR_PER_MAJOR
  for (let i = 0; i <= totalTicks; i += 1) {
    const fraction = i / totalTicks
    const major = i % MINOR_PER_MAJOR === 0
    ticks.push({
      angle: START_ANGLE + SWEEP * fraction,
      major,
      label: major ? `${Math.round(fraction * 100)}` : undefined,
    })
  }

  return (
    <DashboardPanel title="Win Rate" subtitle="Contacts who responded ÷ all contacts">
      <div
        className={styles.gaugeWrap}
        style={{ background: VIZ_CHART_WELL_BG, borderRadius: 'var(--radius-sm)' }}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.dial}
          role="img"
          aria-label={
            hasData
              ? `Win rate ${Math.round(rate * 100)} percent: ${respondedCount} of ${totalCount} contacts responded`
              : 'Win rate unavailable: no contacts yet'
          }
        >
          {/* Track — the full scale, so the filled portion is read as a
              share of something rather than floating alone. */}
          <path
            d={arcPath(START_ANGLE, START_ANGLE + SWEEP, R_ARC)}
            fill="none"
            stroke={VIZ_MID_GRAY}
            strokeWidth={R_ARC_WIDTH}
            strokeLinecap="round"
            opacity={0.35}
          />
          {hasData && rate > 0 && (
            <path
              d={arcPath(START_ANGLE, valueAngle, R_ARC)}
              fill="none"
              stroke={VIZ_GREEN}
              strokeWidth={R_ARC_WIDTH}
              strokeLinecap="round"
            />
          )}

          {/* Spokes: long/labelled at each quarter, short in between. */}
          {ticks.map(({ angle, major, label }) => {
            const inner = polar(angle, major ? R_TICK_INNER_MAJOR : R_TICK_INNER_MINOR)
            const outer = polar(angle, R_TICK_OUTER)
            const labelPos = polar(angle, R_LABEL)
            return (
              <g key={angle}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={major ? VIZ_AXIS_TEXT : VIZ_GRID_LINE}
                  strokeWidth={major ? 2 : 1}
                  strokeLinecap="round"
                />
                {label !== undefined && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    fill={VIZ_AXIS_TEXT}
                    fontSize={10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {label}
                  </text>
                )}
              </g>
            )
          })}

          {hasData && (
            <g>
              {/* The needle starts outside the hub rather than at dead
                  centre: a full-radius needle runs straight through the
                  percentage readout, and at 0%/100% it crosses the digits
                  entirely. Starting at R_NEEDLE_INNER leaves the readout
                  legible at every value. */}
              <line
                x1={polar(valueAngle, R_NEEDLE_INNER).x}
                y1={polar(valueAngle, R_NEEDLE_INNER).y}
                x2={polar(valueAngle, R_ARC - 4).x}
                y2={polar(valueAngle, R_ARC - 4).y}
                stroke={VIZ_GREEN}
                strokeWidth={3}
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>

        <div className={styles.center}>
          {hasData ? (
            <div className={styles.percent}>{Math.round(rate * 100)}%</div>
          ) : (
            <div className={styles.noData}>No contacts yet</div>
          )}
        </div>
      </div>
      <div className={styles.counts}>
        <span className={styles.respondedCount}>{respondedCount} responded</span>
        <span className={styles.totalCount}>{totalCount} contacts</span>
      </div>
    </DashboardPanel>
  )
}
