import { describe, expect, it } from 'vitest'
import {
  computePeriodRange,
  computeSeasonRange,
  endOfLocalDay,
  formatPeriodRangeLabel,
  startOfLocalDay,
  validateCustomRange,
} from './period'

describe('startOfLocalDay / endOfLocalDay', () => {
  it('return local midnight and local end-of-day for the same calendar date', () => {
    const d = new Date(2026, 7, 15, 13, 45, 30)
    expect(startOfLocalDay(d)).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0))
    expect(endOfLocalDay(d)).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999))
  })
})

describe('computeSeasonRange — Jul 31 / Aug 1 boundary', () => {
  it('on Jul 31 (just before the boundary), the season is the PRIOR Aug 1 through this Jun 30', () => {
    const range = computeSeasonRange(new Date(2026, 6, 31)) // Jul 31, 2026
    expect(range.start).toEqual(new Date(2025, 7, 1, 0, 0, 0, 0)) // Aug 1, 2025
    expect(range.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999)) // Jun 30, 2026
  })

  it('on Aug 1 itself (the boundary), the season is THIS Aug 1 through next Jun 30', () => {
    const range = computeSeasonRange(new Date(2026, 7, 1)) // Aug 1, 2026
    expect(range.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
    expect(range.end).toEqual(new Date(2027, 5, 30, 23, 59, 59, 999))
  })

  it('deep into the season (e.g. February) still resolves to the Aug-1-that-already-passed', () => {
    const range = computeSeasonRange(new Date(2027, 1, 15)) // Feb 15, 2027
    expect(range.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
    expect(range.end).toEqual(new Date(2027, 5, 30, 23, 59, 59, 999))
  })

  it('deep before the season (e.g. May) resolves to the PRIOR Aug 1', () => {
    const range = computeSeasonRange(new Date(2026, 4, 10)) // May 10, 2026
    expect(range.start).toEqual(new Date(2025, 7, 1, 0, 0, 0, 0))
    expect(range.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999))
  })
})

describe('validateCustomRange', () => {
  it('rejects an end date before the start date', () => {
    expect(validateCustomRange('2026-08-10', '2026-08-01')).toMatch(/cannot be before/i)
  })

  it('accepts equal start/end (a single-day custom range)', () => {
    expect(validateCustomRange('2026-08-10', '2026-08-10')).toBeNull()
  })

  it('accepts a valid ascending range', () => {
    expect(validateCustomRange('2026-08-01', '2026-08-10')).toBeNull()
  })

  it('is lenient (returns null) when either field is still empty', () => {
    expect(validateCustomRange('', '2026-08-10')).toBeNull()
    expect(validateCustomRange('2026-08-10', '')).toBeNull()
  })
})

describe('computePeriodRange', () => {
  const today = new Date(2026, 7, 26) // Wed, Aug 26, 2026

  it("'overall' has no range", () => {
    expect(computePeriodRange('overall', today)).toBeNull()
  })

  it("'today' is exactly today's local calendar day", () => {
    const range = computePeriodRange('today', today)
    expect(range).toEqual({
      start: new Date(2026, 7, 26, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    })
  })

  it("'week' runs from the most recent Sunday through the end of today", () => {
    // Aug 26, 2026 is a Wednesday; the preceding Sunday is Aug 23.
    const range = computePeriodRange('week', today)
    expect(range).toEqual({
      start: new Date(2026, 7, 23, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    })
  })

  it("'month' runs from the 1st of the current month through the end of today", () => {
    const range = computePeriodRange('month', today)
    expect(range).toEqual({
      start: new Date(2026, 7, 1, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    })
  })

  it("'season' matches computeSeasonRange", () => {
    expect(computePeriodRange('season', today)).toEqual(computeSeasonRange(today))
  })

  it("'custom' parses the two YYYY-MM-DD inputs as local start/end-of-day", () => {
    const range = computePeriodRange('custom', today, { start: '2026-01-05', end: '2026-01-10' })
    expect(range).toEqual({
      start: new Date(2026, 0, 5, 0, 0, 0, 0),
      end: new Date(2026, 0, 10, 23, 59, 59, 999),
    })
  })

  it("'custom' with no input at all returns null", () => {
    expect(computePeriodRange('custom', today)).toBeNull()
  })

  it("'custom' with both fields still empty strings returns null rather than crashing — this is DashboardPage's real initial state the moment 'Custom' is selected, before either date picker has a value (reproduced live: this exact case threw 'Invalid time value' before the fix)", () => {
    expect(computePeriodRange('custom', today, { start: '', end: '' })).toBeNull()
  })

  it("'custom' with only one field filled in returns null, not a half-parsed range", () => {
    expect(computePeriodRange('custom', today, { start: '2026-08-01', end: '' })).toBeNull()
    expect(computePeriodRange('custom', today, { start: '', end: '2026-08-10' })).toBeNull()
  })

  it("'custom' with an invalid (end before start) range returns null rather than a backwards range", () => {
    expect(
      computePeriodRange('custom', today, { start: '2026-08-10', end: '2026-08-01' }),
    ).toBeNull()
  })
})

describe('formatPeriodRangeLabel', () => {
  it("labels 'overall' (range === null) as 'All time'", () => {
    expect(formatPeriodRangeLabel(null)).toBe('All time')
  })

  it('labels a real range with both resolved calendar dates', () => {
    const range = { start: new Date(2026, 7, 23, 0, 0, 0, 0), end: new Date(2026, 7, 26, 23, 59, 59, 999) }
    expect(formatPeriodRangeLabel(range)).toBe('Aug 23, 2026 – Aug 26, 2026')
  })

  it('labels a single-day custom range with the same date on both sides', () => {
    const range = { start: new Date(2026, 0, 5, 0, 0, 0, 0), end: new Date(2026, 0, 5, 23, 59, 59, 999) }
    expect(formatPeriodRangeLabel(range)).toBe('Jan 5, 2026 – Jan 5, 2026')
  })
})
