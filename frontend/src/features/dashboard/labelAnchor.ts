/**
 * Shared "zero-floor label anchor" logic for `TotalOutputChart` and
 * `PipelineChart`. Both render one stacked horizontal bar per row with a
 * single `<LabelList>` carrying that row's grand total — Recharts has no
 * per-row (as opposed to per-segment) label primitive, so the total has
 * to be anchored to whichever segment's `<Bar>` actually renders the
 * `<LabelList>`. Recharts also silently drops a `<LabelList>` entirely
 * when the segment it's attached to has value exactly 0 (no geometry to
 * anchor to) — found during this task's manual verification, where a
 * rep's total label vanished whenever their count in the anchored segment
 * happened to be exactly zero, an extremely common case (a rep with no
 * Follow-ups, or no opportunities in the pipeline's last stage), not a
 * rare edge case.
 *
 * The fix floors ONLY the anchored segment's fed-in value at a visually
 * negligible epsilon (never the true count shown anywhere else — tooltips
 * round it back). That means TWO decisions have to stay in lockstep: which
 * segment gets floored, and which segment's `<Bar>` renders the
 * `<LabelList>`. Before this module existed, each chart component made
 * both decisions independently — once while building the floored `data`
 * array, once again inline in the `.map()` that renders `<Bar>` elements
 * (`index === keys.length - 1` in one place, a separately-computed
 * "last key" constant in the other). They always agreed in practice
 * because both happened to derive from the same array's length, but
 * nothing enforced that: a future change to either the buckets/stages
 * array or to how bars are rendered could silently decouple them, and the
 * failure mode is exactly the invisible one described above — a rep's
 * total simply disappears, with the chart otherwise rendering fine.
 *
 * This module is the single source of truth for "the anchor key" so both
 * decisions read the SAME value instead of recomputing it — see
 * `labelAnchor.test.ts` for the invariant this is meant to make
 * impossible to break.
 */

/** The key/id that gets both the zero-floor treatment and the
 * `<LabelList>` — currently the last entry in `keys`, in whatever order
 * the caller's series/stage array is in. Returns `undefined` for an empty
 * array (nothing to anchor to). */
export function labelAnchorKey<K extends string>(keys: readonly K[]): K | undefined {
  return keys.length > 0 ? keys[keys.length - 1] : undefined
}

/** Returns a copy of `row` with `anchorKey`'s value floored at `floor`
 * (never below the row's real value). A no-op when `anchorKey` is
 * `undefined` (the empty-series case `labelAnchorKey` returns for) or
 * when `row[anchorKey]` isn't actually a number (defensive — every real
 * caller's anchor key names a numeric field, but `T` here is intentionally
 * just `object`, not `Record<string, number>` — plain interfaces like
 * `RepOutputRow` have no index signature and aren't assignable to a
 * `Record<...>` constraint even though every property matches it
 * structurally). */
export function floorForLabelAnchor<T extends object, K extends keyof T & string>(
  row: T,
  anchorKey: K | undefined,
  floor: number,
): T {
  if (anchorKey === undefined) return row
  const value = (row as Record<string, unknown>)[anchorKey]
  if (typeof value !== 'number') return row
  return { ...row, [anchorKey]: Math.max(value, floor) } as T
}
