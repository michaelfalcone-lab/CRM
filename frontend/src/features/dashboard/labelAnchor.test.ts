/**
 * Pins the Task 8b fix-round-1 finding: `TotalOutputChart` and
 * `PipelineChart` previously each computed "which segment gets the
 * zero-floor" and "which segment's `<Bar>` renders the `<LabelList>`"
 * independently (`index === keys.length - 1` in the JSX, a
 * separately-derived "last key" constant in the data-prep step) — they
 * always agreed by coincidence, not by construction, so a future change
 * to either one (reordering `OUTPUT_BUCKETS`, an admin adding a 6th
 * opportunity stage, a component-level refactor) could silently decouple
 * them and drop a rep's total label with no error, exactly the invisible
 * failure mode this dashboard already hit once.
 *
 * `labelAnchor.ts` is now the single source of truth both charts read
 * for that decision. These tests exercise the module directly, not
 * through a rendered chart — Recharts' `ResponsiveContainer` renders at
 * 0x0 in jsdom (no real layout pass, no `ResizeObserver`), so a
 * component-level render produces no bar geometry to assert against;
 * pure-function testing is this codebase's established pattern for the
 * dashboard's actual logic (see `aggregations.test.ts`, `period.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { floorForLabelAnchor, labelAnchorKey } from './labelAnchor'

describe('labelAnchorKey', () => {
  it('returns the last key regardless of array order or length', () => {
    expect(labelAnchorKey(['a', 'b', 'c'])).toBe('c')
    expect(labelAnchorKey(['c', 'b', 'a'])).toBe('a')
    expect(labelAnchorKey(['only'])).toBe('only')
  })

  it('returns undefined for an empty series (nothing to anchor to)', () => {
    expect(labelAnchorKey([])).toBeUndefined()
  })
})

describe('floorForLabelAnchor', () => {
  it('floors exactly the anchor key, leaving every other field untouched', () => {
    const row = { displayName: 'Alice', a: 3, b: 0, c: 5 }
    const result = floorForLabelAnchor(row, 'b', 0.0001)
    expect(result).toEqual({ displayName: 'Alice', a: 3, b: 0.0001, c: 5 })
  })

  it('never floors a non-zero value below its real count', () => {
    const row = { a: 7 }
    expect(floorForLabelAnchor(row, 'a', 0.0001).a).toBe(7)
  })

  it('is a no-op when the anchor key is undefined (empty-series case)', () => {
    const row = { a: 1, b: 2 }
    expect(floorForLabelAnchor(row, undefined, 0.0001)).toEqual(row)
  })

  it('is a no-op when the named key is not actually numeric (defensive)', () => {
    const row = { displayName: 'Alice', a: 1 }
    expect(floorForLabelAnchor(row, 'displayName', 0.0001)).toEqual(row)
  })

  it('the anchor and the floored key can never disagree — both are the same value', () => {
    // This is the actual invariant the finding asked to make impossible
    // to break: whatever `labelAnchorKey` returns for a given series is
    // exactly what `floorForLabelAnchor` floors — there is no second,
    // independently-computed "last key" anywhere for a caller to drift
    // out of sync with.
    const keys = ['calls', 'emails', 'meetings', 'followUps'] as const
    const anchor = labelAnchorKey(keys)
    const row = { calls: 1, emails: 2, meetings: 3, followUps: 0 }
    const floored = floorForLabelAnchor(row, anchor, 0.0001)
    expect(anchor).toBe('followUps')
    expect(floored.followUps).toBe(0.0001)
    expect(floored.calls).toBe(1)
    expect(floored.emails).toBe(2)
    expect(floored.meetings).toBe(3)
  })
})
