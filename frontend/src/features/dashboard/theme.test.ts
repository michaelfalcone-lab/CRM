/**
 * Guards every dashboard chart fill against the background it actually
 * renders on.
 *
 * This replaces an earlier version that asserted one specific hex
 * (`VIZ_NEAR_BLACK`) never appears in a fill palette. That pinned the
 * symptom of one bug rather than the rule, so it stayed green while
 * `BRAND_BROWN` (≈1.40:1) and `BRAND_RED` (≈2.43:1) sat in the fill
 * palettes just as invisibly — the exact same defect, different hex.
 * These tests compute the real WCAG contrast ratio instead, so ANY fill
 * that can't be seen fails, whatever its value.
 *
 * The reference background is `VIZ_CHART_WELL_BG` composited over the
 * panel color it sits on, derived from the exported values rather than
 * hardcoded, so changing the well recomputes the bar instead of silently
 * invalidating it.
 */
import { describe, expect, it } from 'vitest'
import {
  CHART_PANEL_BG,
  OUTPUT_BUCKETS,
  VIZ_CHART_WELL_BG,
  pipelineStageColor,
} from './theme'

/** WCAG 2.x minimum contrast for a graphical object / meaningful mark. */
const MIN_GRAPHICAL_CONTRAST = 3

type Rgb = [number, number, number]

function parseHex(hex: string): Rgb {
  const m = hex.replace('#', '').match(/../g)
  if (!m || m.length < 3) throw new Error(`not a hex color: ${hex}`)
  return [parseInt(m[0]!, 16), parseInt(m[1]!, 16), parseInt(m[2]!, 16)]
}

/** Parses the `rgba(r, g, b, a)` form used for chrome/overlay tokens. */
function parseRgba(value: string): { rgb: Rgb; alpha: number } {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (!m) throw new Error(`not an rgba color: ${value}`)
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/** Source-over composite of a translucent overlay onto an opaque backdrop. */
function composite(overlay: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return overlay.map((c, i) => Math.round(c * alpha + backdrop[i]! * (1 - alpha))) as Rgb
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter! + 0.05) / (darker! + 0.05)
}

/** The background a bar/arc fill is actually drawn against: the
 * translucent chart well composited over the panel behind it. */
const wellOverlay = parseRgba(VIZ_CHART_WELL_BG)
const COMPOSITED_WELL = composite(wellOverlay.rgb, wellOverlay.alpha, parseHex(CHART_PANEL_BG))

function contrastAgainstWell(fill: string): number {
  return contrastRatio(parseHex(fill), COMPOSITED_WELL)
}

describe('dashboard chart fills against the composited well background', () => {
  it.each(OUTPUT_BUCKETS.map((b) => [b.label, b.color] as const))(
    'Total Output bucket %s is visible against the well',
    (_label, color) => {
      expect(contrastAgainstWell(color)).toBeGreaterThanOrEqual(MIN_GRAPHICAL_CONTRAST)
    },
  )

  it('every Total Output bucket has a distinct fill', () => {
    const colors = OUTPUT_BUCKETS.map((b) => b.color)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('the Won and Lost pipeline fills are visible against the well', () => {
    expect(contrastAgainstWell(pipelineStageColor({ isWon: true }, 0))).toBeGreaterThanOrEqual(
      MIN_GRAPHICAL_CONTRAST,
    )
    expect(contrastAgainstWell(pipelineStageColor({ isLost: true }, 0))).toBeGreaterThanOrEqual(
      MIN_GRAPHICAL_CONTRAST,
    )
  })

  it('every open Pipeline stage color is visible, at any position past the seeded stages', () => {
    // An admin can add stages beyond the 5 seeded ones, and the ramp
    // cycles — so a later position must not land on an unreadable fill.
    for (let openStageIndex = 0; openStageIndex < 12; openStageIndex += 1) {
      const color = pipelineStageColor({ isWon: false, isLost: false }, openStageIndex)
      expect(contrastAgainstWell(color)).toBeGreaterThanOrEqual(MIN_GRAPHICAL_CONTRAST)
    }
  })

  it('an open stage never reuses the reserved Won or Lost fill', () => {
    const won = pipelineStageColor({ isWon: true }, 0)
    const lost = pipelineStageColor({ isLost: true }, 0)
    for (let openStageIndex = 0; openStageIndex < 12; openStageIndex += 1) {
      const color = pipelineStageColor({ isWon: false, isLost: false }, openStageIndex)
      expect(color).not.toBe(won)
      expect(color).not.toBe(lost)
    }
  })
})
