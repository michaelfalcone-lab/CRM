import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'
import type { RepOutputRow } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import { floorForLabelAnchor, labelAnchorKey } from './labelAnchor'
import {
  BRAND_WHITE,
  OUTPUT_BUCKETS,
  VIZ_AXIS_TEXT,
  VIZ_CHART_WELL_BG,
  VIZ_GRID_LINE,
  VIZ_TOOLTIP_BG,
  VIZ_TOOLTIP_BORDER,
  VIZ_TOOLTIP_TEXT,
} from './theme'

export interface TotalOutputChartProps {
  rows: RepOutputRow[]
  teamTotal: RepOutputRow
}

/** A visually-negligible floor applied only to the LAST stacked bucket's
 * own value (never to the true count shown anywhere else) — see this
 * component's doc comment for why. At the chart's typical scale (a unit
 * is tens of pixels) this shifts nothing visible; `Tooltip`'s formatter
 * below rounds it back to a clean integer for display. */
const ZERO_FLOOR = 0.0001

/** Bold the "Team Total" row's tick label so it reads as an aggregate,
 * not just another rep. */
function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: string }
}) {
  const isTeamTotal = payload?.value === 'Team Total'
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill={BRAND_WHITE}
      fontWeight={isTeamTotal ? 700 : 400}
      fontSize={13}
    >
      {payload?.value}
    </text>
  )
}

/** The single anchor key both the zero-floor and the `<LabelList>`
 * placement below key off — see `labelAnchor.ts`'s doc comment for why
 * this MUST be the one place that decision is made, not recomputed
 * separately in the data-prep step and the `<Bar>` JSX. */
const LABEL_ANCHOR_KEY = labelAnchorKey(OUTPUT_BUCKETS.map((bucket) => bucket.key))

/** Total Output — one horizontal stacked bar per rep plus a Team Total
 * row, bucketed Initial Outreach / Calls / Emails / Meetings /
 * Follow-ups (see `computeTotalOutput`'s doc comment for the exact
 * sequence-then-method bucketing rule).
 *
 * Every `<Bar>` sets `isAnimationActive={false}` — found during this
 * task's manual verification that Recharts v3's default grow-in
 * animation left every bar segment permanently unpainted (rendered as an
 * empty `recharts-inactive-bar` group, zero children) while the rest of
 * the chart — axis domain, gridlines, category labels — rendered
 * correctly from the exact same data. Disabling the animation renders
 * the final geometry immediately instead of animating toward it, which
 * also means a manager never sees a data dashboard that's still visibly
 * "growing" in on load.
 *
 * The plotted area is wrapped in a `VIZ_CHART_WELL_BG` backdrop — see
 * that constant's doc comment in `theme.ts` for why a brand-brown bar
 * segment needs a non-brown background to be visible at all.
 *
 * The "labeled with its total at the end" requirement is carried by
 * `<LabelList>` on the anchor bucket's `<Bar>` (currently Follow-ups,
 * per `LABEL_ANCHOR_KEY`), reading `total` instead of that bucket's own
 * value — but found during manual verification that Recharts skips
 * rendering a `LabelList` entry entirely when the bar segment it's
 * attached to has value exactly 0 (no geometry to anchor to), which
 * silently dropped a rep's total label whenever their Follow-ups count
 * happened to be zero — an extremely common case, not a rare edge case,
 * and exactly the "zero-activity rep" case the brief calls out. Fixed by
 * flooring ONLY the anchor bucket's fed-in value at `ZERO_FLOOR` (never
 * literally 0, so a rectangle always exists to anchor the label to)
 * while the `Tooltip` rounds the displayed number back to a clean
 * integer. Both the floor below and the `<LabelList>` placement in the
 * `<Bar>` map read the SAME `LABEL_ANCHOR_KEY` — see `labelAnchor.ts`. */
export function TotalOutputChart({ rows, teamTotal }: TotalOutputChartProps) {
  const data = [...rows, teamTotal].map((row) =>
    floorForLabelAnchor(row, LABEL_ANCHOR_KEY, ZERO_FLOOR),
  )
  const height = Math.max(220, data.length * 56 + 60)

  return (
    <DashboardPanel title="Total Output" subtitle="Activities logged this period, by rep">
      <div style={{ background: VIZ_CHART_WELL_BG, borderRadius: 'var(--radius-sm)', padding: 8 }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 48, bottom: 8, left: 8 }}
            barCategoryGap={16}
          >
            <CartesianGrid horizontal={false} stroke={VIZ_GRID_LINE} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: VIZ_AXIS_TEXT, fontSize: 12 }}
              axisLine={{ stroke: VIZ_GRID_LINE }}
              tickLine={{ stroke: VIZ_GRID_LINE }}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              width={110}
              tick={<CategoryTick />}
              axisLine={{ stroke: VIZ_GRID_LINE }}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, name) => [typeof value === 'number' ? Math.round(value) : value, name]}
              contentStyle={{ background: VIZ_TOOLTIP_BG, border: `1px solid ${VIZ_TOOLTIP_BORDER}` }}
              labelStyle={{ color: VIZ_TOOLTIP_TEXT, fontWeight: 700 }}
              itemStyle={{ color: VIZ_TOOLTIP_TEXT }}
            />
            <Legend
              formatter={(value) => OUTPUT_BUCKETS.find((b) => b.key === value)?.label ?? value}
              wrapperStyle={{ color: VIZ_AXIS_TEXT, fontSize: 12 }}
            />
            {OUTPUT_BUCKETS.map((bucket) => (
              <Bar
                key={bucket.key}
                dataKey={bucket.key}
                stackId="totalOutput"
                fill={bucket.color}
                isAnimationActive={false}
              >
                {bucket.key === LABEL_ANCHOR_KEY && (
                  <LabelList
                    dataKey="total"
                    position="right"
                    fill={BRAND_WHITE}
                    fontSize={13}
                    fontWeight={600}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  )
}
