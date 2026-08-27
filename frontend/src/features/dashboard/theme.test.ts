/**
 * Pins the Task 8b fix-round-1 finding: `VIZ_NEAR_BLACK` (`#2f2f2f`)
 * computes to only ≈1.17:1 contrast against `VIZ_CHART_WELL_BG` composited
 * over the brand-brown panel (≈`#2f2019`) — far under WCAG's 3:1 minimum
 * for a graphical element, i.e. effectively invisible. It was Follow-ups'
 * color in `OUTPUT_BUCKETS` before this fix (see that constant's doc
 * comment for the full contrast reasoning and why every fill was
 * checked, not just the broken one). This test guards against it quietly
 * reappearing in either well-backed chart's fill palette.
 */
import { describe, expect, it } from 'vitest'
import {
  OUTPUT_BUCKETS,
  VIZ_NEAR_BLACK,
  pipelineStageColor,
} from './theme'

describe('dashboard chart fills against the composited well background', () => {
  it('no Total Output bucket uses VIZ_NEAR_BLACK as its fill', () => {
    const colors = OUTPUT_BUCKETS.map((bucket) => bucket.color)
    expect(colors).not.toContain(VIZ_NEAR_BLACK)
  })

  it('no open Pipeline stage color (any position, including beyond the 5 seeded stages) is VIZ_NEAR_BLACK', () => {
    // Exercise well past the 3 open stages the current seed data has —
    // an admin can add more stages, and the ramp must keep cycling
    // through visible colors rather than eventually reaching the
    // near-invisible one.
    for (let openStageIndex = 0; openStageIndex < 12; openStageIndex += 1) {
      const color = pipelineStageColor({ isWon: false, isLost: false }, openStageIndex)
      expect(color).not.toBe(VIZ_NEAR_BLACK)
    }
  })
})
