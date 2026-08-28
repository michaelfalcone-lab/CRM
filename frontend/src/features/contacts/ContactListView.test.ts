/**
 * Unit test for `sortByLastContactedFirst` — the Task 8b default sort
 * ("oldest/never-contacted first") so a rep's list surfaces duplicate-
 * outreach risk (a contact touched again and again while others go
 * untouched) without needing to sort manually.
 */
import { describe, expect, it } from 'vitest'
import type { Contact } from 'shared'
import type { WithId } from '../../lib/firestoreTypes'
import { sortContacts, sortByLastContactedFirst } from './ContactListView'

function contact(
  id: string,
  lastContactSeconds?: number,
  overrides: Partial<Contact> = {},
): WithId<Contact> {
  return {
    id,
    firstName: 'F',
    lastName: id,
    organizationId: null,
    ownerId: 'rep-1',
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    searchTokens: [],
    nameLower: id.toLowerCase(),
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    importBatchId: null,
    ...(lastContactSeconds !== undefined
      ? { lastContactDate: { seconds: lastContactSeconds, nanoseconds: 0 } }
      : {}),
    ...overrides,
  }
}

describe('sortByLastContactedFirst', () => {
  it('sorts contacts oldest-last-contact first', () => {
    const c1 = contact('recent', 3000)
    const c2 = contact('oldest', 1000)
    const c3 = contact('middle', 2000)
    const sorted = sortByLastContactedFirst([c1, c2, c3])
    expect(sorted.map((c) => c.id)).toEqual(['oldest', 'middle', 'recent'])
  })

  it('puts a never-contacted contact (no lastContactDate at all) before every dated contact', () => {
    const dated = contact('dated', 1) // the earliest possible real timestamp
    const neverContacted = contact('never')
    const sorted = sortByLastContactedFirst([dated, neverContacted])
    expect(sorted.map((c) => c.id)).toEqual(['never', 'dated'])
  })

  it('does not mutate the input array', () => {
    const input = [contact('a', 2), contact('b', 1)]
    const original = [...input]
    sortByLastContactedFirst(input)
    expect(input).toEqual(original)
  })

  it('handles an empty list', () => {
    expect(sortByLastContactedFirst([])).toEqual([])
  })

  it('handles multiple never-contacted contacts without crashing (stable-ish, all first)', () => {
    const never1 = contact('never1')
    const never2 = contact('never2')
    const dated = contact('dated', 100)
    const sorted = sortByLastContactedFirst([dated, never1, never2])
    expect(sorted.map((c) => c.id).slice(0, 2).sort()).toEqual(['never1', 'never2'])
    expect(sorted[2]!.id).toBe('dated')
  })
})

describe('sortContacts', () => {
  const zeta = contact('zeta', 100, { firstName: 'Zoe', lastName: 'Zeta' })
  const alpha = contact('alpha', 200, { firstName: 'Amy', lastName: 'Alpha' })
  const mid = contact('mid', 300, { firstName: 'Mo', lastName: 'Mid' })

  it('sorts by name ascending on last name, then first', () => {
    const sorted = sortContacts([zeta, mid, alpha], 'name', 'asc')
    expect(sorted.map((c) => c.id)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('reverses on descending', () => {
    const sorted = sortContacts([alpha, mid, zeta], 'name', 'desc')
    expect(sorted.map((c) => c.id)).toEqual(['zeta', 'mid', 'alpha'])
  })

  it('sorts by organization name, putting contacts with no organization last regardless of direction', () => {
    // A blank isn't "before A" or "after Z" — it's absent. Sorting it into
    // the alphabet either way would bury real organizations behind a wall
    // of dashes on one of the two directions.
    const withOrg = contact('a', 1, { organizationId: 'o1', organizationName: 'Acme' })
    const noOrg = contact('b', 2, { organizationId: null })
    const otherOrg = contact('c', 3, { organizationId: 'o2', organizationName: 'Zenith' })

    expect(sortContacts([noOrg, otherOrg, withOrg], 'organization', 'asc').map((c) => c.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(sortContacts([noOrg, otherOrg, withOrg], 'organization', 'desc').map((c) => c.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('sorts by status, putting contacts with no status last regardless of direction', () => {
    const active = contact('a', 1, { status: 'active' })
    const none = contact('b', 2)
    const warm = contact('c', 3, { status: 'warm' })

    expect(sortContacts([none, warm, active], 'status', 'asc').map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(sortContacts([none, warm, active], 'status', 'desc').map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by owner id', () => {
    const a = contact('a', 1, { ownerId: 'uid-aaa' })
    const b = contact('b', 2, { ownerId: 'uid-zzz' })
    expect(sortContacts([b, a], 'owner', 'asc').map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = [zeta, alpha]
    const original = [...input]
    sortContacts(input, 'name', 'asc')
    expect(input).toEqual(original)
  })

  it('handles an empty list', () => {
    expect(sortContacts([], 'name', 'asc')).toEqual([])
  })
})
