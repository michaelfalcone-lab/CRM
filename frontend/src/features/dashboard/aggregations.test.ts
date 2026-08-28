import { describe, expect, it } from 'vitest'
import type { ActivityType, FirestoreTimestamp } from 'shared'
import {
  computeConversionResults,
  computePipeline,
  computeTotalOutput,
  computeContactResponseRate,
  unionOpportunities,
  type ActivityLike,
  type OpportunityLike,
  type RepDirectoryEntry,
  type StageLike,
} from './aggregations'

function ts(date: Date): FirestoreTimestamp {
  return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }
}

const REP_A: RepDirectoryEntry = { ownerId: 'rep-a', displayName: 'Alice' }
const REP_B: RepDirectoryEntry = { ownerId: 'rep-b', displayName: 'Bob' }
const REPS = [REP_A, REP_B]

let nextId = 0
function activity(overrides: Partial<ActivityLike> & Pick<ActivityLike, 'contactId' | 'ownerId' | 'type' | 'occurredAt'>): ActivityLike {
  nextId += 1
  return {
    id: overrides.id ?? `activity-${nextId}`,
    createdAt: overrides.createdAt ?? overrides.occurredAt,
    ...overrides,
  }
}

describe('computeTotalOutput', () => {
  it('a contact whose only activity in the period is a call lands in Initial Outreach, NOT Calls', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.initialOutreach).toBe(1)
    expect(alice.calls).toBe(0)
    expect(alice.total).toBe(1)
  })

  it('a later "Other"-type touch for the same contact lands in Follow-ups', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Other', occurredAt: ts(new Date(2026, 7, 5)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.initialOutreach).toBe(1) // the Email, despite not being a call/meeting
    expect(alice.followUps).toBe(1) // the later Other touch
    expect(alice.emails).toBe(0) // NOT counted as a later "Emails" touch — it was the first touch
    expect(alice.total).toBe(2)
  })

  it('every later activity type buckets by its own method (Calls / Emails / Meetings / Follow-ups)', () => {
    const base = new Date(2026, 7, 1)
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Other', occurredAt: ts(base) }), // Initial Outreach
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Inbound Call', occurredAt: ts(new Date(2026, 7, 2)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - VM', occurredAt: ts(new Date(2026, 7, 3)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 4)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Onsite Appointment', occurredAt: ts(new Date(2026, 7, 5)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.initialOutreach).toBe(1)
    expect(alice.calls).toBe(2) // Inbound Call + Outbound Call - VM
    expect(alice.emails).toBe(1)
    expect(alice.meetings).toBe(1) // Onsite Appointment
    expect(alice.total).toBe(5)
  })

  it('a rep with zero activities in the period renders as an all-zero row, not omitted', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    expect(rows).toHaveLength(2)
    const bob = rows.find((r) => r.ownerId === 'rep-b')!
    expect(bob).toEqual({
      ownerId: 'rep-b',
      displayName: 'Bob',
      initialOutreach: 0,
      calls: 0,
      emails: 0,
      meetings: 0,
      followUps: 0,
      total: 0,
    })
  })

  it('zero activities overall still returns a row per rep, all zero, and a zero Team Total', () => {
    const { rows, teamTotal } = computeTotalOutput([], REPS)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.total === 0)).toBe(true)
    expect(teamTotal.total).toBe(0)
  })

  it('Team Total sums exactly to the visible rep rows', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c2', ownerId: 'rep-b', type: 'Inbound Call', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c2', ownerId: 'rep-b', type: 'Email', occurredAt: ts(new Date(2026, 7, 3)) }),
    ]
    const { rows, teamTotal } = computeTotalOutput(activities, REPS)
    const summed = rows.reduce((acc, r) => acc + r.total, 0)
    expect(teamTotal.total).toBe(summed)
    expect(teamTotal.initialOutreach).toBe(2)
    expect(teamTotal.emails).toBe(1) // Bob's second (later) touch
  })

  it('per-contact ordering spans all reps (not per-rep), crediting each touch to its own ownerId', () => {
    // Same contact, reassigned mid-period: Alice's touch happens first
    // (Initial Outreach), Bob's later touch on the SAME contact is a
    // later touch bucketed by method, credited to Bob.
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-b', type: 'Email', occurredAt: ts(new Date(2026, 7, 10)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    const bob = rows.find((r) => r.ownerId === 'rep-b')!
    expect(alice.initialOutreach).toBe(1)
    expect(alice.calls).toBe(0)
    expect(bob.initialOutreach).toBe(0)
    expect(bob.emails).toBe(1)
  })

  it('an activity whose ownerId matches no current active rep is excluded from rows and Team Total alike', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'departed-rep', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { rows, teamTotal } = computeTotalOutput(activities, REPS)
    expect(rows.every((r) => r.total === 0)).toBe(true)
    expect(teamTotal.total).toBe(0)
  })

  it('a later touch whose type is outside the ActivityType union (legacy/imported data) lands in Follow-ups, not a stray NaN property', () => {
    // `commitImport` genuinely ingests activities from CSV, and legacy
    // data can predate a type-value rename — either way, `type` can be a
    // string that doesn't match any of `LATER_TOUCH_BUCKET`'s keys at
    // runtime, even though `ActivityLike.type` is statically typed as
    // `ActivityType`. This must fall back to Follow-ups (the catch-all
    // "later touch that isn't a recognized call/email/meeting"), not
    // silently create `row[undefined]` as a `NaN` property.
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({
        contactId: 'c1',
        ownerId: 'rep-a',
        // Deliberately outside the `ActivityType` union — simulating
        // legacy/imported data, not something the type system would let
        // a normal caller construct.
        type: 'Legacy Postcard' as unknown as ActivityLike['type'],
        occurredAt: ts(new Date(2026, 7, 5)),
      }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.followUps).toBe(1)
    expect(alice.total).toBe(2)
    expect(Number.isNaN(alice.calls)).toBe(false)
    expect(Number.isNaN(alice.emails)).toBe(false)
    expect(Number.isNaN(alice.meetings)).toBe(false)
    expect(Number.isNaN(alice.followUps)).toBe(false)
  })
})

describe('computeContactResponseRate', () => {
  const REPS_CR: RepDirectoryEntry[] = [
    { ownerId: 'rep-a', displayName: 'Alice' },
    { ownerId: 'rep-b', displayName: 'Bob' },
  ]
  const owned = (id: string, ownerId = 'rep-a') => ({ id, ownerId })
  const act = (contactId: string, type: ActivityType) => ({ contactId, type })

  it('returns a null rate (not 0, not NaN) when there are no contacts at all', () => {
    const result = computeContactResponseRate([], [], REPS_CR)
    expect(result).toEqual({ respondedCount: 0, totalCount: 0, rate: null })
  })

  it('counts a contact as responded once it has an inbound call', () => {
    const result = computeContactResponseRate(
      [owned('c1'), owned('c2')],
      [act('c1', 'Inbound Call')],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 2, rate: 0.5 })
  })

  it('does NOT count an outbound email that has no reply logged against it', () => {
    const result = computeContactResponseRate([owned('c1')], [act('c1', 'Email')], REPS_CR)
    expect(result).toEqual({ respondedCount: 0, totalCount: 1, rate: 0 })
  })

  it('does NOT count a voicemail left with no callback logged', () => {
    const result = computeContactResponseRate(
      [owned('c1')],
      [act('c1', 'Outbound Call - VM')],
      REPS_CR,
    )
    expect(result.respondedCount).toBe(0)
  })

  it('counts the contact once the emailed prospect replies', () => {
    // The workflow this metric exists for: the outbound touch alone is not
    // a win; logging the reply later is what converts it.
    const result = computeContactResponseRate(
      [owned('c1')],
      [act('c1', 'Email'), act('c1', 'Email Reply Received')],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 1, rate: 1 })
  })

  it('counts the contact once a voicemail is returned', () => {
    const result = computeContactResponseRate(
      [owned('c1')],
      [act('c1', 'Outbound Call - VM'), act('c1', 'Voicemail Returned')],
      REPS_CR,
    )
    expect(result.respondedCount).toBe(1)
  })

  it('counts a contact only once no matter how many qualifying replies it has', () => {
    const result = computeContactResponseRate(
      [owned('c1')],
      [
        act('c1', 'Inbound Call'),
        act('c1', 'Email Reply Received'),
        act('c1', 'Outbound Call - Talked To'),
      ],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 1, rate: 1 })
  })

  it('does not count in-person activity types, which are out of scope for this build', () => {
    const result = computeContactResponseRate(
      [owned('c1')],
      [act('c1', 'Onsite Appointment')],
      REPS_CR,
    )
    expect(result.respondedCount).toBe(0)
  })

  it('ignores activity for a contact that is not in the contact set', () => {
    // A stale/orphaned activity must never push respondedCount above
    // totalCount, which would render as a rate over 100%.
    const result = computeContactResponseRate(
      [owned('c1')],
      [act('c1', 'Inbound Call'), act('ghost', 'Inbound Call')],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 1, rate: 1 })
  })

  it('excludes contacts owned by someone outside the rep directory', () => {
    const result = computeContactResponseRate(
      [owned('c1', 'rep-a'), owned('c2', 'not-a-listed-rep')],
      [act('c1', 'Inbound Call')],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 1, rate: 1 })
  })

  it('counts contacts across every rep in the directory, not just one', () => {
    const result = computeContactResponseRate(
      [owned('c1', 'rep-a'), owned('c2', 'rep-b'), owned('c3', 'rep-b')],
      [act('c2', 'Inbound Call')],
      REPS_CR,
    )
    expect(result).toEqual({ respondedCount: 1, totalCount: 3, rate: 1 / 3 })
  })
})

describe('computeConversionResults', () => {
  function opp(overrides: Partial<OpportunityLike> & Pick<OpportunityLike, 'ownerId'>): OpportunityLike {
    nextId += 1
    return {
      id: overrides.id ?? `opp-${nextId}`,
      stage: overrides.stage ?? 'created',
      createdAt: overrides.createdAt ?? ts(new Date(2026, 7, 1)),
      ...overrides,
    }
  }

  it('Connections counts only genuine two-way interaction types', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Inbound Call', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c2', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c3', ownerId: 'rep-a', type: 'Onsite Appointment', occurredAt: ts(new Date(2026, 7, 1)) }),
      // Not connections — an attempt (VM), a one-way channel (Email), or the catch-all (Other).
      activity({ contactId: 'c5', ownerId: 'rep-a', type: 'Outbound Call - VM', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c6', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c7', ownerId: 'rep-a', type: 'Other', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { columns } = computeConversionResults(activities, [], [], REPS)
    expect(columns.find((c) => c.ownerId === 'rep-a')!.connections).toBe(3)
  })

  it('Conversion Rate handles the zero-created case explicitly (null)', () => {
    const { columns, teamTotal } = computeConversionResults([], [], [], REPS)
    expect(columns.every((c) => c.conversionRate === null)).toBe(true)
    expect(teamTotal.conversionRate).toBeNull()
  })

  it('Conversion Rate = won / created per rep and for Team Total', () => {
    const created = [opp({ ownerId: 'rep-a' }), opp({ ownerId: 'rep-a' }), opp({ ownerId: 'rep-b' })]
    const won = [opp({ ownerId: 'rep-a' })]
    const { columns, teamTotal } = computeConversionResults([], created, won, REPS)
    const alice = columns.find((c) => c.ownerId === 'rep-a')!
    const bob = columns.find((c) => c.ownerId === 'rep-b')!
    expect(alice).toMatchObject({ created: 2, won: 1, conversionRate: 0.5 })
    expect(bob).toMatchObject({ created: 1, won: 0, conversionRate: 0 })
    expect(teamTotal).toMatchObject({ created: 3, won: 1, conversionRate: 1 / 3 })
  })

  it('a rep with no activity/opportunities in the period still renders a zeroed column', () => {
    const { columns } = computeConversionResults([], [], [], REPS)
    expect(columns).toHaveLength(2)
    expect(columns.find((c) => c.ownerId === 'rep-b')).toEqual({
      ownerId: 'rep-b',
      displayName: 'Bob',
      connections: 0,
      created: 0,
      won: 0,
      conversionRate: null,
    })
  })
})

describe('unionOpportunities', () => {
  it('deduplicates by id across multiple lists', () => {
    const a = { id: 'o1' }
    const b = { id: 'o2' }
    const merged = unionOpportunities([a], [b, a], [])
    expect(merged.map((o) => o.id).sort()).toEqual(['o1', 'o2'])
  })

  it('an item appearing in all three (created+won+lost is impossible in practice, but created+won is real) counts once', () => {
    const shared = { id: 'o1', tag: 'x' }
    const merged = unionOpportunities([shared], [shared], [])
    expect(merged).toHaveLength(1)
  })
})

describe('computePipeline', () => {
  const STAGES: StageLike[] = [
    { id: 'created', label: 'Created', order: 1, color: 'info' },
    { id: 'in-conversation', label: 'In Conversation', order: 2, color: 'secondary' },
    { id: 'lost', label: 'Lost', order: 4, color: 'danger' },
    { id: 'won', label: 'Won', order: 5, color: 'success' },
  ]

  function opp(ownerId: string, stage: string): OpportunityLike {
    nextId += 1
    return { id: `opp-${nextId}`, ownerId, stage, createdAt: ts(new Date(2026, 7, 1)) }
  }

  it('buckets each opportunity by owner and current stage, with per-row totals equal to the sum of segments', () => {
    const opportunities = [
      opp('rep-a', 'created'),
      opp('rep-a', 'won'),
      opp('rep-b', 'lost'),
    ]
    const { rows, stages } = computePipeline(opportunities, STAGES, REPS)
    expect(stages.map((s) => s.id)).toEqual(['created', 'in-conversation', 'lost', 'won']) // sorted by order
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.byStage).toEqual({ created: 1, 'in-conversation': 0, lost: 0, won: 1 })
    expect(alice.total).toBe(2)
    const bob = rows.find((r) => r.ownerId === 'rep-b')!
    expect(bob.total).toBe(1)
    expect(bob.byStage.lost).toBe(1)
  })

  it('a rep with no opportunities in scope still renders a zeroed row across every stage', () => {
    const { rows } = computePipeline([], STAGES, REPS)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.total).toBe(0)
      expect(Object.values(row.byStage).every((v) => v === 0)).toBe(true)
    }
  })

  it('an opportunity referencing a retired/unresolvable stage id is excluded from segments and total alike', () => {
    const opportunities = [opp('rep-a', 'created'), opp('rep-a', 'ad-hoc-retired-stage')]
    const { rows } = computePipeline(opportunities, STAGES, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.total).toBe(1) // only the resolvable one counts
    expect(
      Object.values(alice.byStage).reduce((a, b) => a + b, 0),
    ).toBe(alice.total) // segments always sum to total
  })
})
