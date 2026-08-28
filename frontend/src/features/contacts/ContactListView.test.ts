/**
 * Unit tests for the contacts list's ordering rules and its days-since
 * derivation.
 *
 * `sortByLastContactedFirst` ("oldest/never-contacted first") surfaces
 * duplicate-outreach risk — a contact touched again and again while
 * others go untouched. It is no longer the list's default (that is now
 * name A–Z) but is the ordering behind the Days Since Last Contact
 * column's ascending sort.
 */
import { describe, expect, it } from 'vitest'
import type { Contact } from 'shared'
import type { WithId } from '../../lib/firestoreTypes'
import { daysSince, sortContacts, sortByLastContactedFirst } from './ContactListView'

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

  describe('lastContact (Days Since Last Contact)', () => {
    it('sorts most-overdue first ascending, with never-contacted at the top', () => {
      const recent = contact('recent', 3000)
      const stale = contact('stale', 1000)
      const never = contact('never')

      expect(sortContacts([recent, stale, never], 'lastContact', 'asc').map((c) => c.id)).toEqual([
        'never',
        'stale',
        'recent',
      ])
    })

    it('reverses on descending, sinking never-contacted to the bottom', () => {
      const recent = contact('recent', 3000)
      const stale = contact('stale', 1000)
      const never = contact('never')

      expect(sortContacts([stale, never, recent], 'lastContact', 'desc').map((c) => c.id)).toEqual([
        'recent',
        'stale',
        'never',
      ])
    })

    // Two never-contacted contacts both map to the same sentinel. It has
    // to be a finite one: `-Infinity - -Infinity` is NaN, which is not a
    // valid comparator result and leaves the ordering engine-defined.
    it('orders several never-contacted contacts without producing a NaN comparison', () => {
      const never1 = contact('never1')
      const never2 = contact('never2')
      const dated = contact('dated', 500)

      const sorted = sortContacts([dated, never1, never2], 'lastContact', 'asc')
      expect(sorted.map((c) => c.id).slice(0, 2).sort()).toEqual(['never1', 'never2'])
      expect(sorted[2]!.id).toBe('dated')
    })
  })

  describe('timesContacted', () => {
    const counts = new Map([
      ['many', 9],
      ['few', 2],
    ])

    it('sorts numerically, not lexicographically', () => {
      // The point of a numeric compare: as strings, '10' sorts before '9'.
      const ten = contact('ten', 1)
      const nine = contact('nine', 2)
      const numeric = new Map([
        ['ten', 10],
        ['nine', 9],
      ])
      expect(sortContacts([ten, nine], 'timesContacted', 'asc', numeric).map((c) => c.id)).toEqual([
        'nine',
        'ten',
      ])
    })

    it('treats a contact absent from the counts map as zero touches', () => {
      const many = contact('many', 1)
      const few = contact('few', 2)
      const untouched = contact('untouched', 3)

      expect(
        sortContacts([many, few, untouched], 'timesContacted', 'asc', counts).map((c) => c.id),
      ).toEqual(['untouched', 'few', 'many'])
    })

    it('reverses on descending', () => {
      const many = contact('many', 1)
      const few = contact('few', 2)
      expect(sortContacts([few, many], 'timesContacted', 'desc', counts).map((c) => c.id)).toEqual([
        'many',
        'few',
      ])
    })
  })
})

describe('daysSince', () => {
  const now = Date.UTC(2026, 7, 28) // fixed clock, so these never drift

  it('returns null for a contact who has never been contacted', () => {
    expect(daysSince(undefined, now)).toBeNull()
  })

  it('returns 0 on the same day', () => {
    expect(daysSince({ seconds: now / 1000, nanoseconds: 0 }, now)).toBe(0)
  })

  it('floors a partial day rather than rounding up', () => {
    const thirtySixHoursAgo = { seconds: now / 1000 - 36 * 3600, nanoseconds: 0 }
    expect(daysSince(thirtySixHoursAgo, now)).toBe(1)
  })

  it('counts whole days back', () => {
    const tenDaysAgo = { seconds: now / 1000 - 10 * 86_400, nanoseconds: 0 }
    expect(daysSince(tenDaysAgo, now)).toBe(10)
  })

  // A rep can log a meeting that is already on the calendar for next week.
  // "-7 days since last contact" is nonsense; it clamps to 0 ("Today").
  it('clamps a future date to 0 instead of going negative', () => {
    const nextWeek = { seconds: now / 1000 + 7 * 86_400, nanoseconds: 0 }
    expect(daysSince(nextWeek, now)).toBe(0)
  })
})
