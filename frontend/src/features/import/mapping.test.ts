/**
 * Unit tests for the CSV column-mapping logic: auto-detecting a default
 * header -> field mapping, applying a mapping to a raw CSV row to produce
 * a `CommitImportRow`, keeping two headers from ever claiming the same
 * target field, and serializing a mapping for `CommitImportData.
 * columnMapping`. Pure functions, no DOM/Firestore/network involved.
 */
import { describe, expect, it } from 'vitest'
import {
  claimedTargets,
  guessColumnMapping,
  IMPORT_FIELD_OPTIONS,
  mapRowToCommitRow,
  serializeColumnMapping,
} from './mapping'
import { IGNORE_FIELD } from './types'

describe('guessColumnMapping', () => {
  it('matches common header spellings to their target field', () => {
    const mapping = guessColumnMapping([
      'First Name',
      'Last Name',
      'Email',
      'Phone Number',
      'Company',
      'Status',
      'Last Contact Date',
      'Last Contact Mode',
    ])
    expect(mapping['First Name']).toBe('firstName')
    expect(mapping['Last Name']).toBe('lastName')
    expect(mapping['Email']).toBe('email')
    expect(mapping['Phone Number']).toBe('phone')
    expect(mapping['Company']).toBe('organizationName')
    expect(mapping['Status']).toBe('status')
    expect(mapping['Last Contact Date']).toBe('lastContactDate')
    expect(mapping['Last Contact Mode']).toBe('lastContactMode')
  })

  it('defaults an unrecognized header to Ignore rather than guessing', () => {
    const mapping = guessColumnMapping(['Favorite Color'])
    expect(mapping['Favorite Color']).toBe(IGNORE_FIELD)
  })

  it('never lets two headers claim the same target field, even if both look like aliases for it', () => {
    const mapping = guessColumnMapping(['Email', 'E-Mail'])
    expect(mapping['Email']).toBe('email')
    expect(mapping['E-Mail']).toBe(IGNORE_FIELD)
  })

  it('is case- and punctuation-insensitive', () => {
    const mapping = guessColumnMapping(['e_mail', 'PHONE-NUMBER'])
    expect(mapping['e_mail']).toBe('email')
    expect(mapping['PHONE-NUMBER']).toBe('phone')
  })
})

describe('mapRowToCommitRow', () => {
  it('applies a mapping to produce a CommitImportRow, dropping ignored columns and blank cells', () => {
    const mapping = {
      First: 'firstName',
      Last: 'lastName',
      Notes: IGNORE_FIELD,
      Phone: 'phone',
    } as const
    const { data, warnings } = mapRowToCommitRow(
      { First: 'Ada', Last: 'Lovelace', Notes: 'irrelevant', Phone: '' },
      mapping,
    )
    expect(data).toEqual({ firstName: 'Ada', lastName: 'Lovelace' })
    expect(warnings).toEqual([])
  })

  it('trims whitespace from every mapped value', () => {
    const { data } = mapRowToCommitRow(
      { First: '  Ada  ' },
      { First: 'firstName' },
    )
    expect(data.firstName).toBe('Ada')
  })

  it('accepts an exact legacy last-contact-mode value', () => {
    const { data, warnings } = mapRowToCommitRow(
      { Mode: 'In-Person' },
      { Mode: 'lastContactMode' },
    )
    expect(data.lastContactMode).toBe('In-Person')
    expect(warnings).toEqual([])
  })

  it('warns (but does not throw) on a last-contact-mode value outside the legacy 5-value union', () => {
    const { data, warnings } = mapRowToCommitRow(
      { Mode: 'Voicemail' },
      { Mode: 'lastContactMode' },
    )
    expect(data.lastContactMode).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Voicemail/)
  })

  it('never offers or accepts any of the 7 ActivityType values as a last-contact-mode target', () => {
    // The dashboard's Log Contact flow uses a richer 7-value ActivityType
    // union; commitImport validates lastContactMode against only the
    // legacy 5. "Meeting" and "Note" are ActivityType values that are NOT
    // in the legacy union, so they must warn like any other invalid value.
    const { data, warnings } = mapRowToCommitRow({ Mode: 'Meeting' }, { Mode: 'lastContactMode' })
    expect(data.lastContactMode).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  it('passes through a parseable last-contact-date unchanged, with no warning', () => {
    const { data, warnings } = mapRowToCommitRow(
      { Date: '2026-01-15' },
      { Date: 'lastContactDate' },
    )
    expect(data.lastContactDate).toBe('2026-01-15')
    expect(warnings).toEqual([])
  })

  it('warns on an unparseable last-contact-date but still passes the raw value through', () => {
    const { data, warnings } = mapRowToCommitRow(
      { Date: 'not-a-date' },
      { Date: 'lastContactDate' },
    )
    expect(data.lastContactDate).toBe('not-a-date')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/not-a-date/)
  })
})

describe('claimedTargets', () => {
  it('excludes the given header itself, but includes every other header’s non-Ignore target', () => {
    const mapping = { A: 'firstName', B: 'email', C: IGNORE_FIELD } as const
    expect(claimedTargets(mapping, 'A')).toEqual(new Set(['email']))
    expect(claimedTargets(mapping, 'B')).toEqual(new Set(['firstName']))
    expect(claimedTargets(mapping, 'C')).toEqual(new Set(['firstName', 'email']))
  })
})

describe('serializeColumnMapping', () => {
  it('renders an ignored column as the literal string "Ignore" and everything else as its field name', () => {
    const mapping = { First: 'firstName', Notes: IGNORE_FIELD } as const
    expect(serializeColumnMapping(mapping)).toEqual({ First: 'firstName', Notes: 'Ignore' })
  })
})

describe('IMPORT_FIELD_OPTIONS', () => {
  it('never includes a sport field — sport is set per-contact via the Opportunity UI, not CSV import', () => {
    expect(IMPORT_FIELD_OPTIONS.some((o) => o.field === ('sport' as never))).toBe(false)
  })
})
