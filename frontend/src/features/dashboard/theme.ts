/**
 * Chart color plan for the sales-output dashboard, per the
 * `anthropic-skills:brown-athletics-brand` skill's `references/
 * data-viz.md`. `frontend/src/styles/tokens.css` is the single source of
 * truth for the exact hex values (`--brand-brown`, `--brand-red`, and the
 * `--viz-*` extended ramp, defined right next to it there) — these are
 * literal mirrors, needed because Recharts' `fill`/`stroke` props (and
 * plain inline-style color props) want a real color string, not a CSS
 * custom property lookup.
 *
 * The hard rule from the skill, and from the Task 8b brief: **red is
 * reserved for a single highlighted series** — here, the Pipeline chart's
 * `Lost` segment and the Win Rate gauge's loss share. It must never
 * appear as an ordinary neutral category color. Opacity is fine on
 * chrome (axes/gridlines/ticks/tooltip chrome) but never on the three
 * brand colors themselves.
 */

// ---- Brand (official, 3-color palette — never tinted/lightened/gradiented) ----
export const BRAND_BROWN = '#4e3629'
export const BRAND_RED = '#c00404'
export const BRAND_WHITE = '#ffffff'

// ---- Extended neutral ramp — OFF-BRAND, see tokens.css's --viz-* comment
//      for the full callout. Deliberately neutral grays, not tinted
//      browns. Flag for Brand Management before this dashboard goes
//      anywhere external. ----
export const VIZ_WARM_GRAY = '#7a6a5f'
export const VIZ_LIGHT_WARM_GRAY = '#a89d94'
export const VIZ_NEAR_BLACK = '#2f2f2f'
export const VIZ_MID_GRAY = '#8c8c8c'

// ---- Chrome on the dashboard's dark brown panels: white at reduced
//      opacity (opacity on white/chrome, never on brand brown/red). ----
export const VIZ_GRID_LINE = 'rgba(255, 255, 255, 0.2)'
export const VIZ_AXIS_TEXT = 'rgba(255, 255, 255, 0.85)'
export const VIZ_TOOLTIP_BG = VIZ_NEAR_BLACK
export const VIZ_TOOLTIP_BORDER = VIZ_WARM_GRAY
export const VIZ_TOOLTIP_TEXT = BRAND_WHITE

/**
 * A recessed backdrop for the plotted chart area itself — black at low
 * opacity, i.e. chrome, not a brand color. Necessary, not decorative:
 * `BRAND_BROWN` is both this dashboard's panel background AND the fill
 * for two chart series (Total Output's "Initial Outreach", Pipeline's
 * "Won"). Without something behind the plot that isn't brand brown, a
 * brown bar/arc segment is literally the same color as the panel it sits
 * on and renders invisible — found during this task's manual
 * verification (the "Won" pipeline segment and the win-share of the
 * gauge both silently disappeared against the panel). This wraps each
 * chart's plotted area only, not the whole panel — the panel's header
 * and margins still read as solid brand brown, per the brief.
 */
export const VIZ_CHART_WELL_BG = 'rgba(0, 0, 0, 0.4)'

/** Total Output's 5 segments, in stacking order (Initial Outreach is the
 * headline metric — the one brand-brown series; the rest are the neutral
 * ramp so red stays reserved for Pipeline's Lost / the gauge). */
export const OUTPUT_BUCKETS = [
  { key: 'initialOutreach', label: 'Initial Outreach', color: BRAND_BROWN },
  { key: 'calls', label: 'Calls', color: VIZ_WARM_GRAY },
  { key: 'emails', label: 'Emails', color: VIZ_LIGHT_WARM_GRAY },
  { key: 'meetings', label: 'Meetings', color: VIZ_MID_GRAY },
  { key: 'followUps', label: 'Follow-ups', color: VIZ_NEAR_BLACK },
] as const

const OPEN_STAGE_RAMP = [VIZ_LIGHT_WARM_GRAY, VIZ_MID_GRAY, VIZ_WARM_GRAY, VIZ_NEAR_BLACK]

/**
 * A Pipeline segment's color. `isWon`/`isLost` win over everything —
 * brand brown / brand red respectively, matching the "one highlighted
 * series" rule (Lost is the ONLY red in this chart). An open stage
 * (neither flag set) cycles through the neutral ramp by its position
 * among open stages specifically (`openStageIndex`, not the stage's raw
 * `order`, so Lost/Won sitting in the middle of the `order` sequence
 * doesn't skip a ramp color) — this never hardcodes a stage id, only
 * reads flags plus relative position, both proper `OpportunityStage`
 * fields.
 */
export function pipelineStageColor(
  stage: { isWon?: boolean; isLost?: boolean },
  openStageIndex: number,
): string {
  if (stage.isWon) return BRAND_BROWN
  if (stage.isLost) return BRAND_RED
  return OPEN_STAGE_RAMP[openStageIndex % OPEN_STAGE_RAMP.length]!
}
