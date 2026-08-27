/**
 * Pins the local-date parsing convention `dates.ts` documents: a
 * `YYYY-MM-DD` string must resolve to *local* midnight, never UTC
 * midnight. `new Date('2026-08-26')` (the UTC-midnight interpretation)
 * would fail the primary assertions below in any timezone behind UTC
 * (e.g. US Eastern, which is what this repo's dev/CI machines run) — that
 * naive parse rolls the date back to Aug 25 locally.
 */
import { describe, expect, it } from 'vitest'
import { parseLocalDateInput, toLocalDateInput, todayLocalDateInput } from './dates'

describe('parseLocalDateInput', () => {
  it('resolves a YYYY-MM-DD string to local midnight on that exact calendar date', () => {
    const d = parseLocalDateInput('2026-08-26')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August, 0-indexed
    expect(d.getDate()).toBe(26)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('differs from the naive UTC-midnight `new Date(string)` parse in a timezone behind UTC', () => {
    const naiveUtcParse = new Date('2026-08-26')
    const isBehindUtc = naiveUtcParse.getTimezoneOffset() > 0
    if (!isBehindUtc) return // only meaningful off of UTC (this repo's machines run US Eastern)

    // The naive parse rolls back to Aug 25 locally; the fixed parse does not.
    expect(naiveUtcParse.getDate()).not.toBe(26)
    expect(parseLocalDateInput('2026-08-26').getDate()).toBe(26)
  })

  it('correctly resolves the season-boundary date (Aug 1) that a UTC-midnight parse would push into the prior season', () => {
    const d = parseLocalDateInput('2026-08-01')
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(1)
  })
})

describe('toLocalDateInput', () => {
  it('is the exact inverse of parseLocalDateInput', () => {
    expect(toLocalDateInput(parseLocalDateInput('2026-08-26'))).toBe('2026-08-26')
    expect(toLocalDateInput(parseLocalDateInput('2026-01-05'))).toBe('2026-01-05')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toLocalDateInput(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('todayLocalDateInput', () => {
  it('matches toLocalDateInput(new Date()) — local "today", not UTC "today"', () => {
    expect(todayLocalDateInput()).toBe(toLocalDateInput(new Date()))
  })
})
