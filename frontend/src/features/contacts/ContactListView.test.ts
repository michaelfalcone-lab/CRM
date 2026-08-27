/**
 * Unit test for `sortByLastContactedFirst` — the Task 8b default sort
 * ("oldest/never-contacted first") so a rep's list surfaces duplicate-
 * outreach risk (a contact touched again and again while others go
 * untouched) without needing to sort manually.
 */
import { describe, expect, it } from 'vitest'
import type { Contact } from 'shared'
import type { WithId } from '../../lib/firestoreTypes'
import { sortByLastContactedFirst } from './ContactListView'

function contact(id: string, lastContactSeconds?: number): WithId<Contact> {
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
