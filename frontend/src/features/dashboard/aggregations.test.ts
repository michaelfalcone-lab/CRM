import { describe, expect, it } from 'vitest'
import type { ActivityType, FirestoreTimestamp } from 'shared'
import {
  computeConversionResults,
  computeOrgOpportunityRanking,
  computePipeline,
  computeTotalOutput,
  computeConnectionRate,
  unionOpportunities,
  type ActivityLike,
  type OpportunityLike,
  type OrganizationLike,
  type OrgOpportunityLike,
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
  it("counts a contact's only activity under its own method — a call is a call", () => {
    // The inverse of the old rule: a first touch used to be pulled out
    // into a separate "Initial Outreach" bucket regardless of its type.
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.calls).toBe(1)
    expect(alice.total).toBe(1)
  })

  it('an "Other"-type touch lands in Follow-ups', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Other', occurredAt: ts(new Date(2026, 7, 5)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.emails).toBe(1)
    expect(alice.followUps).toBe(1)
    expect(alice.total).toBe(2)
  })

  it('every activity type buckets by its own method (Calls / Emails / Meetings / Follow-ups)', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Other', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Inbound Call', occurredAt: ts(new Date(2026, 7, 2)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - VM', occurredAt: ts(new Date(2026, 7, 3)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Email', occurredAt: ts(new Date(2026, 7, 4)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Onsite Appointment', occurredAt: ts(new Date(2026, 7, 5)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.calls).toBe(2) // Inbound Call + Outbound Call - VM
    expect(alice.emails).toBe(1)
    expect(alice.meetings).toBe(1) // Onsite Appointment
    expect(alice.followUps).toBe(1) // Other
    expect(alice.total).toBe(5)
  })

  it('counts every touch of the same contact, not just the first', () => {
    // Directly pins the removal of the first-touch special case: three
    // calls to one contact are three calls.
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - VM', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - VM', occurredAt: ts(new Date(2026, 7, 2)) }),
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 3)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    expect(alice.calls).toBe(3)
    expect(alice.total).toBe(3)
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
    expect(teamTotal.emails).toBe(2) // Alice's + Bob's
    expect(teamTotal.calls).toBe(1) // Bob's Inbound Call
  })

  it('credits each touch of a mid-period-reassigned contact to its own ownerId', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'rep-a', type: 'Outbound Call - Talked To', occurredAt: ts(new Date(2026, 7, 1)) }),
      activity({ contactId: 'c1', ownerId: 'rep-b', type: 'Email', occurredAt: ts(new Date(2026, 7, 10)) }),
    ]
    const { rows } = computeTotalOutput(activities, REPS)
    const alice = rows.find((r) => r.ownerId === 'rep-a')!
    const bob = rows.find((r) => r.ownerId === 'rep-b')!
    expect(alice.calls).toBe(1)
    expect(alice.total).toBe(1)
    expect(bob.emails).toBe(1)
    expect(bob.total).toBe(1)
  })

  it('an activity whose ownerId matches no current active rep is excluded from rows and Team Total alike', () => {
    const activities = [
      activity({ contactId: 'c1', ownerId: 'departed-rep', type: 'Email', occurredAt: ts(new Date(2026, 7, 1)) }),
    ]
    const { rows, teamTotal } = computeTotalOutput(activities, REPS)
    expect(rows.every((r) => r.total === 0)).toBe(true)
    expect(teamTotal.total).toBe(0)
  })

  it('a touch whose type is outside the ActivityType union (legacy/imported data) lands in Follow-ups, not a stray NaN property', () => {
    // `commitImport` genuinely ingests activities from CSV, and legacy
    // data can predate a type-value rename — either way, `type` can be a
    // string that doesn't match any of `TOUCH_BUCKET`'s keys at runtime,
    // even though `ActivityLike.type` is statically typed as
    // `ActivityType`. This must fall back to Follow-ups (the catch-all
    // "touch that isn't a recognized call/email/meeting"), not silently
    // create `row[undefined]` as a `NaN` property.
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

describe('computeConnectionRate', () => {
  const day1 = ts(new Date(2026, 7, 1))
  const cr = (contactId: string, ownerId: string, type: ActivityType) =>
    activity({ contactId, ownerId, type, occurredAt: day1 })

  it('returns a null rate (not 0, not NaN) when there are no activities at all', () => {
    const result = computeConnectionRate([], REPS)
    expect(result).toEqual({ connectedCount: 0, totalCount: 0, rate: null })
  })

  it('a contact touched by an inbound call is both touched and connected', () => {
    const result = computeConnectionRate([cr('c1', 'rep-a', 'Inbound Call')], REPS)
    expect(result).toEqual({ connectedCount: 1, totalCount: 1, rate: 1 })
  })

  it('a contact touched only by an outbound email (no reply) counts toward the denominator, not the numerator', () => {
    const result = computeConnectionRate([cr('c1', 'rep-a', 'Email')], REPS)
    expect(result).toEqual({ connectedCount: 0, totalCount: 1, rate: 0 })
  })

  it('a contact touched only by a voicemail left (no callback) counts toward the denominator, not the numerator', () => {
    const result = computeConnectionRate([cr('c1', 'rep-a', 'Outbound Call - VM')], REPS)
    expect(result).toEqual({ connectedCount: 0, totalCount: 1, rate: 0 })
  })

  it('a contact touched only by a meeting/other-type activity still counts toward the denominator, not the numerator', () => {
    // The point of the fix: the denominator is "everyone this period's
    // output touched" (matching computeTotalOutput's exact scope), not just
    // contacts reached by call or email — but a meeting alone still isn't a
    // "connection" for the numerator.
    const result = computeConnectionRate(
      [cr('c1', 'rep-a', 'Onsite Appointment'), cr('c2', 'rep-a', 'Other')],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 0, totalCount: 2, rate: 0 })
  })

  it('counts the contact once the emailed prospect replies', () => {
    // The workflow this metric exists for: the outbound touch alone is not
    // a connection; logging the reply is what converts it.
    const result = computeConnectionRate(
      [cr('c1', 'rep-a', 'Email'), cr('c1', 'rep-a', 'Email Reply Received')],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 1, totalCount: 1, rate: 1 })
  })

  it('counts the contact once a voicemail is returned', () => {
    const result = computeConnectionRate(
      [cr('c1', 'rep-a', 'Outbound Call - VM'), cr('c1', 'rep-a', 'Voicemail Returned')],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 1, totalCount: 1, rate: 1 })
  })

  it('counts a contact only once no matter how many qualifying activities it has', () => {
    const result = computeConnectionRate(
      [
        cr('c1', 'rep-a', 'Inbound Call'),
        cr('c1', 'rep-a', 'Email Reply Received'),
        cr('c1', 'rep-a', 'Outbound Call - Talked To'),
      ],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 1, totalCount: 1, rate: 1 })
  })

  it('excludes activity logged by an owner outside the rep directory', () => {
    // A deactivated/off-directory account's activity must not inflate
    // either number — matches computeTotalOutput's same exclusion.
    const result = computeConnectionRate(
      [cr('c1', 'rep-a', 'Inbound Call'), cr('c2', 'not-a-listed-rep', 'Inbound Call')],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 1, totalCount: 1, rate: 1 })
  })

  it('counts contacts across every rep in the directory, not just one', () => {
    const result = computeConnectionRate(
      [
        cr('c1', 'rep-a', 'Other'),
        cr('c2', 'rep-b', 'Inbound Call'),
        cr('c3', 'rep-b', 'Other'),
      ],
      REPS,
    )
    expect(result).toEqual({ connectedCount: 1, totalCount: 3, rate: 1 / 3 })
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

describe('computeOrgOpportunityRanking', () => {
  const ORG_A: OrganizationLike = { id: 'org-a', name: 'Acme Co' }
  const ORG_B: OrganizationLike = { id: 'org-b', name: 'Beta Inc' }

  function orgOpp(organizationId: string | null): OrgOpportunityLike {
    nextId += 1
    return { id: `opp-${nextId}`, organizationId }
  }

  it('ranks organizations descending by opportunity count', () => {
    const opportunities = [orgOpp('org-a'), orgOpp('org-a'), orgOpp('org-b')]
    const rows = computeOrgOpportunityRanking(opportunities, [ORG_A, ORG_B], 10)
    expect(rows).toEqual([
      { organizationId: 'org-a', name: 'Acme Co', total: 2 },
      { organizationId: 'org-b', name: 'Beta Inc', total: 1 },
    ])
  })

  it('excludes opportunities with no organizationId (contact-only pursuits)', () => {
    const opportunities = [orgOpp(null), orgOpp('org-a')]
    const rows = computeOrgOpportunityRanking(opportunities, [ORG_A], 10)
    expect(rows).toEqual([{ organizationId: 'org-a', name: 'Acme Co', total: 1 }])
  })

  it('only produces rows for organizations with at least one opportunity — no zero-fill', () => {
    const rows = computeOrgOpportunityRanking([orgOpp('org-a')], [ORG_A, ORG_B], 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.organizationId).toBe('org-a')
  })

  it('respects the limit, keeping only the top N after sorting', () => {
    const opportunities = [orgOpp('org-a'), orgOpp('org-a'), orgOpp('org-b')]
    const rows = computeOrgOpportunityRanking(opportunities, [ORG_A, ORG_B], 1)
    expect(rows).toEqual([{ organizationId: 'org-a', name: 'Acme Co', total: 2 }])
  })
})
