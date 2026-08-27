import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { WinRateResult } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import {
  BRAND_BROWN,
  BRAND_RED,
  VIZ_CHART_WELL_BG,
  VIZ_LIGHT_WARM_GRAY,
  VIZ_TOOLTIP_BG,
  VIZ_TOOLTIP_BORDER,
  VIZ_TOOLTIP_TEXT,
} from './theme'
import styles from './WinRateGauge.module.css'

export interface WinRateGaugeProps {
  result: WinRateResult
}

/**
 * A donut "gauge" whose two slices are the two things `rate` is actually
 * built from: the won share (brand brown) and the lost share (brand
 * red) — Lost is the chart's one reserved red highlight, matching the
 * "gauge's low end" role from the brand skill's data-viz guide, and
 * directly visualizes what's dragging the rate down rather than an
 * arbitrary color threshold. With no decisions at all in the period
 * (`rate === null`), renders a flat neutral ring instead of a misleading
 * 0%/100% split.
 *
 * The ring sits on a `VIZ_CHART_WELL_BG` backdrop — the won slice is
 * brand brown, the same color as this dashboard's panel background, and
 * is invisible without something behind it that isn't brand brown (see
 * that constant's doc comment in `theme.ts`; found during this task's
 * manual verification — a 67% win rate rendered as an almost-entirely-red
 * ring with the brown 67% share silently blending into the panel).
 */
export function WinRateGauge({ result }: WinRateGaugeProps) {
  const { wonCount, lostCount, rate } = result
  const hasData = rate !== null

  const data = hasData
    ? [
        { name: 'Won', value: wonCount },
        { name: 'Lost', value: lostCount },
      ]
    : [{ name: 'No decisions yet', value: 1 }]
  const colors = hasData ? [BRAND_BROWN, BRAND_RED] : [VIZ_LIGHT_WARM_GRAY]

  return (
    <DashboardPanel title="Win Rate" subtitle="Won ÷ (Won + Lost) this period">
      <div
        className={styles.gaugeWrap}
        style={{ background: VIZ_CHART_WELL_BG, borderRadius: 'var(--radius-sm)' }}
      >
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              startAngle={90}
              endAngle={-270}
              innerRadius="70%"
              outerRadius="100%"
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={colors[index]} />
              ))}
            </Pie>
            {hasData && (
              <Tooltip
                contentStyle={{ background: VIZ_TOOLTIP_BG, border: `1px solid ${VIZ_TOOLTIP_BORDER}` }}
                labelStyle={{ color: VIZ_TOOLTIP_TEXT, fontWeight: 700 }}
                itemStyle={{ color: VIZ_TOOLTIP_TEXT }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          {hasData ? (
            <div className={styles.percent}>{Math.round(rate * 100)}%</div>
          ) : (
            <div className={styles.noData}>No decisions yet</div>
          )}
        </div>
      </div>
      <div className={styles.counts}>
        <span className={styles.wonCount}>{wonCount} Won</span>
        <span className={styles.lostCount}>{lostCount} Lost</span>
      </div>
    </DashboardPanel>
  )
}
