/**
 * Unit tests for the manual status cycle behind the contacts list's
 * click-to-advance status badge.
 */
import { describe, expect, it } from 'vitest'
import type { Status } from 'shared'
import type { WithId } from './firestoreTypes'
import { nextStatusInCycle } from './statusCycle'

function status(id: string, order: number): WithId<Status> {
  return {
    id,
    label: id,
    order,
    active: true,
    color: 'neutral',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
  }
}

/** The seeded workflow set, in `order`. */
const STATUSES = [
  status('new-lead', 1),
  status('active', 2),
  status('warm', 3),
  status('win', 4),
  status('lost', 5),
]

describe('nextStatusInCycle', () => {
  it('advances through the configured order', () => {
    expect(nextStatusInCycle('new-lead', STATUSES)).toBe('active')
    expect(nextStatusInCycle('active', STATUSES)).toBe('warm')
    expect(nextStatusInCycle('warm', STATUSES)).toBe('win')
    expect(nextStatusInCycle('win', STATUSES)).toBe('lost')
  })

  it('wraps from the last status back to the first', () => {
    // Without wrapping, a contact clicked to Lost could never be clicked
    // back to New Lead — every status has to stay reachable by clicking.
    expect(nextStatusInCycle('lost', STATUSES)).toBe('new-lead')
  })

  it('cycles off a terminal status, unlike the automated workflow', () => {
    // `advanceStatusOnActivity` refuses to move a win/lost contact;
    // clicking is an explicit correction and must be able to.
    expect(nextStatusInCycle('win', STATUSES)).toBe('lost')
    expect(nextStatusInCycle('lost', STATUSES)).toBe('new-lead')
  })

  it('starts at the first status when the contact has no status yet', () => {
    expect(nextStatusInCycle(undefined, STATUSES)).toBe('new-lead')
  })

  it('starts at the first status for an unrecognized status value', () => {
    // e.g. free text carried in by a CSV import, or a retired status id.
    expect(nextStatusInCycle('Do Not Contact', STATUSES)).toBe('new-lead')
  })

  it('sorts by order rather than trusting the given array order', () => {
    const shuffled = [STATUSES[3]!, STATUSES[0]!, STATUSES[4]!, STATUSES[1]!, STATUSES[2]!]
    expect(nextStatusInCycle('new-lead', shuffled)).toBe('active')
    expect(nextStatusInCycle('lost', shuffled)).toBe('new-lead')
  })

  it('returns undefined when there are no statuses to cycle through', () => {
    expect(nextStatusInCycle('active', [])).toBeUndefined()
  })

  it('returns the same single status when only one is configured', () => {
    expect(nextStatusInCycle('only', [status('only', 1)])).toBe('only')
  })
})
