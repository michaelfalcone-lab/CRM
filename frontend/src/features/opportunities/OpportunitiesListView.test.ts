import { describe, expect, it } from 'vitest'
import { sortOpportunityRows, type OpportunityRow } from './OpportunitiesListView'

function row(id: string, overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id,
    sport: 'Football',
    year: '2026',
    displayYear: '2026',
    stageLabel: 'Created',
    contactId: `contact-${id}`,
    contactLabel: `Contact ${id}`,
    organizationId: null,
    organizationLabel: null,
    ownerId: `owner-${id}`,
    ownerName: `Owner ${id}`,
    ...overrides,
  }
}

describe('sortOpportunityRows', () => {
  it('sorts by organization name, putting rows with no organization last regardless of direction', () => {
    // A blank isn't "before A" or "after Z" — it's absent. Sorting it into
    // the alphabet either way would bury real organizations behind a wall
    // of dashes on one of the two directions.
    const withOrg = row('a', { organizationId: 'org-1', organizationLabel: 'Acme' })
    const noOrg = row('b', { organizationId: null, organizationLabel: null })
    const otherOrg = row('c', { organizationId: 'org-2', organizationLabel: 'Zenith' })

    expect(sortOpportunityRows([noOrg, otherOrg, withOrg], 'organization', 'asc').map((r) => r.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(sortOpportunityRows([noOrg, otherOrg, withOrg], 'organization', 'desc').map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('sorts by sport alphabetically', () => {
    const gym = row('a', { sport: 'Gymnastics' })
    const football = row('b', { sport: 'Football' })
    expect(sortOpportunityRows([gym, football], 'sport', 'asc').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sorts by year, putting rows with no year last regardless of direction', () => {
    const y2026 = row('a', { year: '2026' })
    const y2028 = row('b', { year: '2028' })
    const noYear = row('c', { year: undefined })

    expect(sortOpportunityRows([noYear, y2028, y2026], 'year', 'asc').map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(sortOpportunityRows([noYear, y2028, y2026], 'year', 'desc').map((r) => r.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('sorts by stage label alphabetically', () => {
    const won = row('a', { stageLabel: 'Won' })
    const created = row('b', { stageLabel: 'Created' })
    expect(sortOpportunityRows([won, created], 'stage', 'asc').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sorts by contact label alphabetically', () => {
    const zed = row('a', { contactLabel: 'Zed Zephyr' })
    const amy = row('b', { contactLabel: 'Amy Adams' })
    expect(sortOpportunityRows([zed, amy], 'contact', 'asc').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sorts by owner name alphabetically, not by raw owner id', () => {
    // ownerId 'z-uid' sorts after 'a-uid' as raw strings, but the DISPLAYED
    // name is what a rep organizing by owner actually wants sorted.
    const a = row('a', { ownerId: 'z-uid', ownerName: 'Amy Adams' })
    const b = row('b', { ownerId: 'a-uid', ownerName: 'Zed Zephyr' })
    expect(sortOpportunityRows([b, a], 'owner', 'asc').map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('reverses on descending', () => {
    const a = row('a', { sport: 'Football' })
    const b = row('b', { sport: 'Gymnastics' })
    expect(sortOpportunityRows([a, b], 'sport', 'desc').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the input array', () => {
    const input = [row('b', { sport: 'Gymnastics' }), row('a', { sport: 'Football' })]
    const original = [...input]
    sortOpportunityRows(input, 'sport', 'asc')
    expect(input).toEqual(original)
  })

  it('handles an empty list', () => {
    expect(sortOpportunityRows([], 'sport', 'asc')).toEqual([])
  })
})
