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
import { useNavigate } from 'react-router-dom'
import type { RepPipelineRow, StageLike } from './aggregations'
import { DashboardPanel } from './DashboardPanel'
import { floorForLabelAnchor, labelAnchorKey } from './labelAnchor'
import {
  BRAND_WHITE,
  VIZ_AXIS_TEXT,
  VIZ_CHART_WELL_BG,
  VIZ_GRID_LINE,
  VIZ_TOOLTIP_BG,
  VIZ_TOOLTIP_BORDER,
  VIZ_TOOLTIP_TEXT,
  pipelineStageColor,
} from './theme'

export interface PipelineChartProps {
  rows: RepPipelineRow[]
  stages: StageLike[]
}

/** A visually-negligible floor applied only to the LAST stage's own
 * value fed into the chart (never to the true count shown anywhere
 * else) — see this component's doc comment for why. */
const ZERO_FLOOR = 0.0001

/** Assigns each stage a color: `isWon`/`isLost` stages get brand
 * brown/red; open stages cycle the neutral ramp by their position AMONG
 * open stages (not their raw `order`), so Won/Lost sitting elsewhere in
 * the order sequence doesn't skip a ramp color. */
function colorForStages(stages: StageLike[]): Map<string, string> {
  const colors = new Map<string, string>()
  let openIndex = 0
  for (const stage of stages) {
    if (stage.isWon || stage.isLost) {
      colors.set(stage.id, pipelineStageColor(stage, -1))
    } else {
      colors.set(stage.id, pipelineStageColor(stage, openIndex))
      openIndex += 1
    }
  }
  return colors
}

function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={BRAND_WHITE} fontSize={13}>
      {payload?.value}
    </text>
  )
}

/**
 * The tooltip's rows, rendered here rather than through Recharts' default
 * tooltip — same reasoning as `TotalOutputChart`'s `TooltipContent`: the
 * `<Bar>`s below set no `name`, so the default tooltip falls back to the
 * raw `dataKey` (a stage id like `"in-conversation"`), not the label the
 * `<Legend>` two elements below already shows (`"In Conversation"`). Takes
 * `stages` as a prop rather than closing over the outer component's copy
 * so the id → label lookup is explicit and testable in isolation.
 */
function TooltipContent({
  active,
  payload,
  label,
  stages,
  stageColors,
}: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: unknown }[]
  label?: string
  stages: StageLike[]
  stageColors: Map<string, string>
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: VIZ_TOOLTIP_BG,
        border: `1px solid ${VIZ_TOOLTIP_BORDER}`,
        borderRadius: 'var(--radius-sm)',
        padding: '8px 10px',
        color: VIZ_TOOLTIP_TEXT,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => {
        const stage = stages.find((s) => s.id === entry.dataKey)
        const name = stage?.label ?? String(entry.dataKey ?? '')
        const value = typeof entry.value === 'number' ? Math.round(entry.value) : entry.value
        return (
          <div
            key={String(entry.dataKey)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: stageColors.get(String(entry.dataKey)) }}>{name}</span>
            <span>{String(value)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Pipeline — rep vs. rep: one horizontal stacked bar per rep, segmented
 * by current stage. Scope (which opportunities are included at all) is
 * decided by the caller via `computePipeline`'s deduplicated union of the
 * three period queries — this component only renders whatever it's
 * given.
 *
 * `isAnimationActive={false}` on every `<Bar>` — see `TotalOutputChart`'s
 * doc comment for why (Recharts v3's default animation left every
 * segment unpainted in this task's manual verification).
 *
 * The plotted area is wrapped in a `VIZ_CHART_WELL_BG` backdrop — the
 * Won segment is brand brown, same as this dashboard's panel background,
 * and is invisible without it (see that constant's doc comment).
 *
 * The per-bar total label is carried by `<LabelList>` on the anchor
 * stage's `<Bar>` (`ANCHOR_STAGE_ID` below — currently whichever stage
 * sorts last by `order`), with that one stage's fed-in value floored at
 * `ZERO_FLOOR` (never literally 0) so a rectangle always exists to anchor
 * the label to — see `TotalOutputChart`'s doc comment for the full
 * reasoning (Recharts silently drops a `LabelList` entirely when its bar
 * segment's value is exactly 0, which otherwise loses a rep's total
 * whenever their count in the anchor stage specifically happens to be
 * zero). Both the floor below and the `<LabelList>` placement in the
 * `<Bar>` map read the SAME `ANCHOR_STAGE_ID`, computed once via
 * `labelAnchor.ts` — see that module's doc comment for why the two
 * decisions must never be made independently (an admin can add stages
 * beyond the 5 seeded ones, so this can't assume a fixed stage count).
 *
 * Clicking any segment of a rep's bar navigates to `/opportunities`
 * pre-filtered to that rep (`?owner=<ownerId>`) — the only way to get from
 * an aggregate count here to the individual opportunities behind it. */
export function PipelineChart({ rows, stages }: PipelineChartProps) {
  const navigate = useNavigate()
  const stageColors = colorForStages(stages)
  const ANCHOR_STAGE_ID = labelAnchorKey(stages.map((stage) => stage.id))
  const data = rows.map((row) => ({
    displayName: row.displayName,
    ownerId: row.ownerId,
    total: row.total,
    // Floor only `byStage` (a real `Record<string, number>`, unlike the
    // merged object below, which loses its index signature the moment
    // `displayName`/`total` are spread in alongside it) so
    // `floorForLabelAnchor`'s generic `keyof` constraint actually accepts
    // an arbitrary stage id.
    ...floorForLabelAnchor(row.byStage, ANCHOR_STAGE_ID, ZERO_FLOOR),
  }))
  const height = Math.max(200, data.length * 56 + 60)

  return (
    <DashboardPanel
      title="Pipeline — Rep vs. Rep"
      subtitle="Open opportunities in scope this period, by current stage"
    >
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
            <Tooltip content={<TooltipContent stages={stages} stageColors={stageColors} />} />
            <Legend
              formatter={(value) => stages.find((s) => s.id === value)?.label ?? value}
              wrapperStyle={{ color: VIZ_AXIS_TEXT, fontSize: 12 }}
            />
            {stages.map((stage) => (
              <Bar
                key={stage.id}
                dataKey={stage.id}
                stackId="pipeline"
                fill={stageColors.get(stage.id)}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(barData: { payload?: { ownerId: string } }) => {
                  const ownerId = barData.payload?.ownerId
                  if (ownerId) navigate(`/opportunities?owner=${ownerId}`)
                }}
              >
                {stage.id === ANCHOR_STAGE_ID && (
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
