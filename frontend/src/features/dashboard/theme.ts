/**
 * Chart color plan for the sales-output dashboard.
 *
 * ## Why this is not the brand palette
 *
 * Brand colors are **deliberately not used as chart fills here**, at the
 * user's explicit direction ("you can use highlighter colors... disregard
 * brand guidelines just for this"). The reason is measurable, not
 * stylistic: every fill renders on `VIZ_CHART_WELL_BG` composited over the
 * brown panel (≈`#2f2019`), and against that background `BRAND_BROWN`
 * computes to ≈1.40:1 and `BRAND_RED` to ≈2.43:1 — both far under WCAG's
 * 3:1 minimum for a graphical object. Those two carried the dashboard's
 * two most important series (Initial Outreach, the headline metric, and
 * Lost, the one highlighted series), so the most important data was the
 * least visible. The brand's extended neutral ramp couldn't fix it either:
 * it yields only three usable grays for five categories, which is what
 * forced Emails and Follow-ups to share a fill.
 *
 * The deeper problem was that an all-neutral ramp separates categories by
 * lightness alone. Adjacent stacked segments measured 1.07–1.49:1 against
 * *each other* — so the bars read as one block no matter how the
 * background was tuned. Hue separation is what actually fixes a stacked
 * chart; that is why these are saturated hues rather than a gray ramp.
 *
 * Chrome (panels, headings, gridlines, axis text) is unchanged and still
 * brand brown / white — only the data marks changed. **Flag this palette
 * for Brand Management before this dashboard is shown externally.**
 *
 * ## Validation
 *
 * These values were checked with the `dataviz` skill's
 * `validate_palette.js` against this exact surface (`--mode dark
 * --surface "#2f2019"`), not chosen by eye. In the shipped stacking order:
 *   - contrast vs surface .... all 5 ≥ 3:1  PASS
 *   - chroma floor ........... all 5 ≥ 0.1  PASS
 *   - CVD separation ......... worst adjacent ΔE 23.1 (target ≥ 8)  PASS
 *   - normal-vision floor .... worst adjacent ΔE 27.9 (floor ≥ 15)  PASS
 *
 * The one check these fail is the validator's dark-mode *lightness band*
 * (L 0.48–0.67); these sit at 0.72–0.88. That is inherent to a highlighter
 * palette — a neon color is a light one — and it is a harmony guideline,
 * not a legibility gate. Deepening the hues into the band was tried and
 * made things objectively worse: orange↔green fell to ΔE 4.3 (deutan), a
 * hard CVD failure, because muted hues on a dark surface converge for
 * red-green colorblind viewers. The brighter set is both what was asked
 * for and the more accessible one.
 *
 * The ORDER below is load-bearing, not cosmetic: reordering these same
 * five hues moved worst-adjacent CVD separation between ΔE 11.9 and 23.1.
 * `theme.test.ts` pins the contrast rule; re-run the validator if the
 * order changes.
 */

// ---- Brand (official) — chrome and typography only, never a data fill.
//      See this file's header for why fills don't use these. ----
export const BRAND_BROWN = '#4e3629'
export const BRAND_RED = '#c00404'
export const BRAND_WHITE = '#ffffff'

// ---- Legacy neutral ramp. No longer used for data fills (it's what
//      produced the unreadable/duplicated segments described above), but
//      still backs tooltip chrome and the gauge's inert "no data" ring. ----
export const VIZ_WARM_GRAY = '#7a6a5f'
export const VIZ_LIGHT_WARM_GRAY = '#a89d94'
export const VIZ_NEAR_BLACK = '#2f2f2f'
export const VIZ_MID_GRAY = '#8c8c8c'

// ---- Series hues — validated set, see header. Named by hue rather than
//      by the series they carry, so reassigning a series doesn't leave a
//      misleading constant name behind. ----
export const VIZ_GREEN = '#3dff5e'
export const VIZ_MAGENTA = '#ff4fd8'
export const VIZ_YELLOW = '#ffd400'
export const VIZ_CYAN = '#00e5ff'
export const VIZ_ORANGE = '#ff8a1f'
/** Reserved for Lost. Distinct from `BRAND_RED`, which is too dark to
 * read as a fill on this surface (≈2.43:1). */
export const VIZ_RED = '#ff3b3b'

// ---- Chrome on the dashboard's dark brown panels: white at reduced
//      opacity (opacity on white/chrome, never on a data fill). ----
export const VIZ_GRID_LINE = 'rgba(255, 255, 255, 0.2)'
export const VIZ_AXIS_TEXT = 'rgba(255, 255, 255, 0.85)'
export const VIZ_TOOLTIP_BG = VIZ_NEAR_BLACK
export const VIZ_TOOLTIP_BORDER = VIZ_WARM_GRAY
export const VIZ_TOOLTIP_TEXT = BRAND_WHITE

/**
 * A recessed backdrop for the plotted chart area itself — black at low
 * opacity, i.e. chrome, not a brand color. It darkens the plot area so the
 * saturated series hues read at full strength against it; the panel's
 * header and margins still show solid brand brown, per the brief.
 */
export const VIZ_CHART_WELL_BG = 'rgba(0, 0, 0, 0.4)'

/**
 * The panel color a chart's well is composited over — the surface
 * `VIZ_CHART_WELL_BG`'s alpha blends against. Exported so contrast checks
 * derive the real rendered background from these two values instead of
 * hardcoding the composite, which would silently go stale if either
 * changed. Kept as its own name (rather than using `BRAND_BROWN` at the
 * call site) because it means "whatever the panel is," a role that
 * outlives any particular brand color.
 */
export const CHART_PANEL_BG = BRAND_BROWN

/**
 * Total Output's 4 segments, in stacking order. One distinct hue per
 * bucket — no reuse, which is what the previous neutral ramp couldn't
 * offer.
 *
 * A fifth leading segment, Initial Outreach (in `VIZ_GREEN`), was removed
 * when the chart stopped treating a contact's first touch of the period
 * as its own category — every activity now counts under its method. The
 * four surviving hues keep their original assignments, so this remains a
 * subset of the validated palette order; `theme.test.ts` re-checks
 * adjacent contrast on whatever set is here.
 */
export const OUTPUT_BUCKETS = [
  { key: 'calls', label: 'Calls', color: VIZ_MAGENTA },
  { key: 'emails', label: 'Emails', color: VIZ_YELLOW },
  { key: 'meetings', label: 'Meetings', color: VIZ_CYAN },
  { key: 'followUps', label: 'Follow-Ups', color: VIZ_ORANGE },
] as const

/**
 * Open (non-won/non-lost) Pipeline stage colors, cycled by relative
 * position among open stages. Excludes the two reserved outcome hues
 * (`VIZ_GREEN` = Won, `VIZ_RED` = Lost) so a mid-pipeline stage can never
 * be mistaken for a closed one — `theme.test.ts` pins that at every cycle
 * position, not just the first three. The 5 seeded stages
 * (`scripts/seedPipelineStages.ts`) have exactly 3 open stages, so this
 * only cycles if an admin adds more; a 4th open stage repeats a visible
 * color rather than falling off the end of the ramp.
 */
const OPEN_STAGE_RAMP = [VIZ_CYAN, VIZ_YELLOW, VIZ_MAGENTA]

/**
 * A Pipeline segment's color. `isWon`/`isLost` win over everything —
 * green / red respectively, the two reserved outcome hues. An open stage
 * (neither flag set) cycles the ramp by its position among open stages
 * specifically (`openStageIndex`, not the stage's raw `order`, so
 * Lost/Won sitting in the middle of the `order` sequence doesn't skip a
 * ramp color) — this never hardcodes a stage id, only reads flags plus
 * relative position, both proper `OpportunityStage` fields.
 */
export function pipelineStageColor(
  stage: { isWon?: boolean; isLost?: boolean },
  openStageIndex: number,
): string {
  if (stage.isWon) return VIZ_GREEN
  if (stage.isLost) return VIZ_RED
  return OPEN_STAGE_RAMP[openStageIndex % OPEN_STAGE_RAMP.length]!
}
