import { describe, expect, it } from 'vitest'
import { formatOpportunityYear } from './formatOpportunityYear'

describe('formatOpportunityYear', () => {
  it('shows a plain year for a non-basketball sport', () => {
    expect(formatOpportunityYear('Football', '2026')).toBe('2026')
  })

  it("shows a season span for Men's Basketball", () => {
    expect(formatOpportunityYear("Men's Basketball", '2026')).toBe('2026/27')
  })

  it("shows a season span for Women's Basketball", () => {
    expect(formatOpportunityYear("Women's Basketball", '2027')).toBe('2027/28')
  })

  it('returns undefined when there is no year, regardless of sport', () => {
    expect(formatOpportunityYear("Men's Basketball", undefined)).toBeUndefined()
    expect(formatOpportunityYear('Football', undefined)).toBeUndefined()
  })
})
