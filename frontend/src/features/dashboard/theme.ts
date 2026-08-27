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

/**
 * Total Output's 5 segments, in stacking order (Initial Outreach is the
 * headline metric — the one brand-brown series; the rest are the neutral
 * ramp so red stays reserved for Pipeline's Lost / the gauge).
 *
 * `VIZ_NEAR_BLACK` (`#2f2f2f`) is deliberately NOT used here, even though
 * it's part of the sanctioned extended ramp: every bar segment sits on
 * `VIZ_CHART_WELL_BG` (`rgba(0,0,0,0.4)` composited over the brand-brown
 * panel, ≈ `#2f2019`), and `#2f2f2f` against that background computes to
 * ≈1.17:1 contrast — nowhere near WCAG's 3:1 minimum for a graphical
 * element, i.e. the fill and its background are nearly indistinguishable.
 * That was Follow-ups' actual color before this fix, and it's the same
 * invisible-fill class of bug as the brown-on-brown "Won"/gauge issue this
 * dashboard already hit once (see `VIZ_CHART_WELL_BG`'s own doc comment).
 *
 * Follow-ups instead reuses `VIZ_LIGHT_WARM_GRAY` (≈5.89:1 against the
 * composited well — the best contrast of the 4-color ramp). That repeats
 * Emails' color, but the two segments are not adjacent in the stack
 * (Meetings sits between them), so they don't visually merge into one
 * block the way two ADJACENT same-colored segments would; there are only
 * 4 documented ramp colors for the 4 non-brand-brown buckets, and one of
 * those 4 (`VIZ_NEAR_BLACK`) is unusable against this dark well, so some
 * reuse is unavoidable without inventing an un-sanctioned 5th hex.
 *
 * Checked the other 3 against the same composited well while fixing this:
 * `VIZ_WARM_GRAY` (Calls) ≈3.02:1 — passes, right at the line;
 * `VIZ_LIGHT_WARM_GRAY` (Emails) ≈5.89:1; `VIZ_MID_GRAY` (Meetings)
 * ≈4.64:1 — both comfortably pass. `BRAND_BROWN` (Initial Outreach)
 * computes to only ≈1.40:1 against the same well, which is the tracked
 * "VIZ_CHART_WELL_BG compositing through brown" issue — already known,
 * out of scope for this fix round, and left untouched here.
 */
export const OUTPUT_BUCKETS = [
  { key: 'initialOutreach', label: 'Initial Outreach', color: BRAND_BROWN },
  { key: 'calls', label: 'Calls', color: VIZ_WARM_GRAY },
  { key: 'emails', label: 'Emails', color: VIZ_LIGHT_WARM_GRAY },
  { key: 'meetings', label: 'Meetings', color: VIZ_MID_GRAY },
  { key: 'followUps', label: 'Follow-ups', color: VIZ_LIGHT_WARM_GRAY },
] as const

/**
 * Open (non-won/non-lost) Pipeline stage colors, cycled by relative
 * position among open stages. Deliberately only 3 entries, not 4 —
 * `VIZ_NEAR_BLACK` is excluded for the same ≈1.17:1-against-the-well
 * reason documented on `OUTPUT_BUCKETS` above. The 5 seeded stages
 * (`scripts/seedPipelineStages.ts`) have exactly 3 open stages, so this
 * never actually cycled to a 4th slot in practice — but an admin CAN add
 * more stages via the config UI, and `computePipeline`/`PipelineChart`
 * place no ceiling on how many open stages exist, so a 4-color ramp with
 * an invisible 4th entry was a latent recurrence of the exact same bug
 * waiting for one more stage to be added. Cycling a 3-color ramp instead
 * means a 4th+ open stage repeats an earlier (visible) color rather than
 * silently rendering unreadable.
 */
const OPEN_STAGE_RAMP = [VIZ_LIGHT_WARM_GRAY, VIZ_MID_GRAY, VIZ_WARM_GRAY]

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
