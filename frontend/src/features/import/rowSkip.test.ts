/**
 * Unit tests for `isSkippedRow`/`summarizeRows` — the frontend's mirror of
 * `commitImport.ts`'s own row-skip rule. The scenarios below are drawn
 * directly from `functions/src/callable/commitImport.ts`'s row loop and
 * from `functions/src/callable/commitImport.test.ts`'s "records an error
 * for a row with no usable name/email/phone" case, so a change to either
 * side's condition without updating the other should show up here as a
 * failing assertion, not as a UI/backend disagreement discovered later in
 * production.
 */
import { describe, expect, it } from 'vitest'
import { isSkippedRow, summarizeRows } from './rowSkip'
import type { CommitImportRow } from './types'

describe('isSkippedRow', () => {
  it('skips a row with no name, email, or phone at all', () => {
    expect(isSkippedRow({})).toBe(true)
    expect(isSkippedRow({ firstName: '', lastName: '' })).toBe(true)
  })

  it('skips a row whose only non-blank values are whitespace', () => {
    expect(isSkippedRow({ firstName: '   ', lastName: '\t' })).toBe(true)
  })

  it('does NOT skip a row with only a first name', () => {
    expect(isSkippedRow({ firstName: 'Ada' })).toBe(false)
  })

  it('does NOT skip a row with only a last name', () => {
    expect(isSkippedRow({ lastName: 'Lovelace' })).toBe(false)
  })

  it('does NOT skip a row with only an email', () => {
    expect(isSkippedRow({ email: 'ada@example.com' })).toBe(false)
  })

  it('does NOT skip a row with only a phone number', () => {
    expect(isSkippedRow({ phone: '555-1234' })).toBe(false)
  })

  it('is never saved by organization, status, or last-contact fields alone', () => {
    const row: CommitImportRow = {
      organizationName: 'Acme',
      status: 'Active',
      lastContactDate: '2026-01-01',
      lastContactMode: 'Email',
    }
    expect(isSkippedRow(row)).toBe(true)
  })

  it('mirrors the exact scenario from commitImport.test.ts: a blank row is skipped, a row with only email is not', () => {
    const blank: CommitImportRow = { firstName: '', lastName: '' }
    const validByEmail: CommitImportRow = {
      firstName: 'Valid',
      lastName: 'Row',
      email: 'valid-row@example.com',
    }
    expect(isSkippedRow(blank)).toBe(true)
    expect(isSkippedRow(validByEmail)).toBe(false)
  })
})

describe('summarizeRows', () => {
  it('counts total/valid/flagged agreeing with isSkippedRow', () => {
    const rows: CommitImportRow[] = [
      { firstName: 'Ada' },
      { firstName: '', lastName: '' },
      { email: 'x@example.com' },
    ]
    expect(summarizeRows(rows)).toEqual({ total: 3, valid: 2, flagged: 1 })
  })

  it('handles an all-flagged list', () => {
    expect(summarizeRows([{}, { firstName: '  ' }])).toEqual({ total: 2, valid: 0, flagged: 2 })
  })

  it('handles an empty list', () => {
    expect(summarizeRows([])).toEqual({ total: 0, valid: 0, flagged: 0 })
  })
})
