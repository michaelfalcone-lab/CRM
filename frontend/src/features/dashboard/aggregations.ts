/**
 * Pure aggregation functions for the sales-output dashboard. No Firestore,
 * no React — every function here takes plain arrays/objects already
 * fetched by `useDashboardData` and returns plain result objects, so the
 * dashboard's actual math is fully unit-testable without a browser or
 * emulator. Components (`TotalOutputChart`, `WinRateGauge`,
 * `ConversionResultsTable`, `PipelineChart`) call these and render the
 * result — they must never compute counts inline.
 *
 * Two invariants every function here respects (see the Task 8b brief and
 * `shared/src/types.ts`'s `Activity`/`Opportunity` doc comments):
 *   1. Per-rep grouping always keys off `ownerId` — the record's *owning*
 *      rep — never `createdBy` (the acting user, which diverges when an
 *      admin acts on a rep's behalf).
 *   2. `reps` (the row/column set) always comes from the full active-user
 *      directory, not from "whoever happens to own a record in this
 *      period" — a rep with zero activity in the period must still render
 *      as an all-zero row, not be omitted.
 */
import type { ActivityType, FirestoreTimestamp } from 'shared'

/** One directory entry a rep row/column is built from — `ownerId` matches
 * `Activity.ownerId`/`Opportunity.ownerId`, which are `User.authUid`
 * values, not `users` doc ids (see `lib/firestore/users.ts`). */
export interface RepDirectoryEntry {
  ownerId: string
  displayName: string
}

/** The minimal shape every aggregation needs from an `Activity` doc —
 * narrower than `WithId<Activity>` so these functions stay decoupled from
 * the Firestore SDK's `Timestamp` class and are trivial to construct in
 * tests. */
export interface ActivityLike {
  id: string
  contactId: string
  ownerId: string
  type: ActivityType
  occurredAt: FirestoreTimestamp
  createdAt: FirestoreTimestamp
}

/** The minimal shape every aggregation needs from an `Opportunity` doc. */
export interface OpportunityLike {
  id: string
  ownerId: string
  stage: string
  createdAt: FirestoreTimestamp
  wonAt?: FirestoreTimestamp
  lostAt?: FirestoreTimestamp
}

/** The minimal shape needed from an `OpportunityStage` doc for the
 * Pipeline widget's per-stage segments. */
export interface StageLike {
  id: string
  label: string
  order: number
  color: string
}

function toMillis(ts: FirestoreTimestamp): number {
  return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1e6)
}

/** Merges any number of `Opportunity` lists into one deduplicated-by-id
 * array. Used to combine the three separate `createdAt`/`wonAt`/`lostAt`
 * period queries into the single set the Pipeline widget scopes against
 * (an opportunity created AND won inside the same period must count
 * once, not twice). Last-list-wins on a duplicate id, but every list here
 * is always the same underlying doc, so the merged value is identical
 * either way. */
export function unionOpportunities<T extends { id: string }>(...lists: T[][]): T[] {
  const map = new Map<string, T>()
  for (const list of lists) {
    for (const item of list) map.set(item.id, item)
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// Widget 1: Total Output
// ---------------------------------------------------------------------------

/** `ActivityType` -> Total Output bucket, for every type EXCEPT a
 * contact's earliest touch in the period (which is always `Initial
 * Outreach` regardless of type — handled separately in
 * `computeTotalOutput`, not via this table). */
const LATER_TOUCH_BUCKET: Record<ActivityType, 'calls' | 'emails' | 'meetings' | 'followUps'> = {
  'Inbound Call': 'calls',
  'Outbound Call - Talked To': 'calls',
  'Outbound Call - VM': 'calls',
  Email: 'emails',
  'Onsite Appointment': 'meetings',
  'Seat Visit': 'meetings',
  Other: 'followUps',
}

export interface RepOutputRow {
  ownerId: string
  displayName: string
  initialOutreach: number
  calls: number
  emails: number
  meetings: number
  followUps: number
  total: number
}

export interface TotalOutputResult {
  /** One row per active rep in directory order — never omits a rep with
   * zero activity in the period. */
  rows: RepOutputRow[]
  /** Sum of `rows`, so the Team Total bar segment always equals the sum
   * of the rep rows above it (an activity whose `ownerId` doesn't match
   * any current active rep — e.g. historical data from a deactivated
   * account — is excluded from both, rather than inflating Team Total
   * beyond what the visible rows add up to). */
  teamTotal: RepOutputRow
}

function emptyOutputRow(ownerId: string, displayName: string): RepOutputRow {
  return { ownerId, displayName, initialOutreach: 0, calls: 0, emails: 0, meetings: 0, followUps: 0, total: 0 }
}

/**
 * Bucketing rule (see the brief): group the period's activities by
 * `contactId`; within each contact's group, the chronologically EARLIEST
 * activity is `Initial Outreach` regardless of its `type`, and every
 * later activity for that same contact buckets by `type` via
 * `LATER_TOUCH_BUCKET`. "Earliest" is determined across ALL activities
 * for that contact in the period, regardless of which rep logged
 * them — ownership reassignment mid-period is possible (an activity's
 * `ownerId` is a snapshot at log time), so a contact's touch sequence is
 * a single timeline independent of who owns which touch; only the final
 * per-rep credit (which row/bucket cell gets incremented) uses each
 * activity's own `ownerId`.
 */
export function computeTotalOutput(
  activities: ActivityLike[],
  reps: RepDirectoryEntry[],
): TotalOutputResult {
  const rows = new Map<string, RepOutputRow>()
  for (const rep of reps) rows.set(rep.ownerId, emptyOutputRow(rep.ownerId, rep.displayName))

  const byContact = new Map<string, ActivityLike[]>()
  for (const activity of activities) {
    const list = byContact.get(activity.contactId)
    if (list) list.push(activity)
    else byContact.set(activity.contactId, [activity])
  }

  for (const contactActivities of byContact.values()) {
    // Stable ordering: occurredAt first, createdAt as a tiebreak for two
    // activities logged for the same local day, then id for full
    // determinism (two activities can share both timestamps exactly).
    const sorted = [...contactActivities].sort((a, b) => {
      const byOccurred = toMillis(a.occurredAt) - toMillis(b.occurredAt)
      if (byOccurred !== 0) return byOccurred
      const byCreated = toMillis(a.createdAt) - toMillis(b.createdAt)
      if (byCreated !== 0) return byCreated
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    sorted.forEach((activity, index) => {
      const row = rows.get(activity.ownerId)
      if (!row) return // ownerId not in the current active directory — see teamTotal's doc comment
      row.total += 1
      if (index === 0) {
        row.initialOutreach += 1
      } else {
        row[LATER_TOUCH_BUCKET[activity.type]] += 1
      }
    })
  }

  const rowList = reps.map((rep) => rows.get(rep.ownerId)!)
  const teamTotal = rowList.reduce(
    (acc, row) => ({
      ownerId: '__team__',
      displayName: 'Team Total',
      initialOutreach: acc.initialOutreach + row.initialOutreach,
      calls: acc.calls + row.calls,
      emails: acc.emails + row.emails,
      meetings: acc.meetings + row.meetings,
      followUps: acc.followUps + row.followUps,
      total: acc.total + row.total,
    }),
    emptyOutputRow('__team__', 'Team Total'),
  )

  return { rows: rowList, teamTotal }
}

// ---------------------------------------------------------------------------
// Widget 2: Win Rate
// ---------------------------------------------------------------------------

export interface WinRateResult {
  wonCount: number
  lostCount: number
  /** `wonCount / (wonCount + lostCount)`, or `null` when both are zero —
   * callers must render that explicitly (e.g. "—" or "No decisions yet"),
   * never coerce to 0%, which would misleadingly read as "0% win rate"
   * rather than "no data". */
  rate: number | null
}

export function computeWinRate(
  won: { id: string }[],
  lost: { id: string }[],
): WinRateResult {
  const wonCount = won.length
  const lostCount = lost.length
  const denominator = wonCount + lostCount
  return { wonCount, lostCount, rate: denominator === 0 ? null : wonCount / denominator }
}

// ---------------------------------------------------------------------------
// Widget 3: Conversion & Results
// ---------------------------------------------------------------------------

/** A "genuine two-way interaction" per the brief — excludes `Email` and
 * `Outbound Call - VM` (a voicemail is an attempt, not a connection) and
 * `Other`. */
const CONNECTION_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'Inbound Call',
  'Outbound Call - Talked To',
  'Onsite Appointment',
  'Seat Visit',
])

export interface RepConversionColumn {
  ownerId: string
  displayName: string
  connections: number
  created: number
  won: number
  /** `won / created`, or `null` when `created` is zero. */
  conversionRate: number | null
}

export interface ConversionResultsResult {
  columns: RepConversionColumn[]
  teamTotal: RepConversionColumn
}

function emptyConversionColumn(ownerId: string, displayName: string): RepConversionColumn {
  return { ownerId, displayName, connections: 0, created: 0, won: 0, conversionRate: null }
}

export function computeConversionResults(
  activities: ActivityLike[],
  opportunitiesCreated: OpportunityLike[],
  opportunitiesWon: OpportunityLike[],
  reps: RepDirectoryEntry[],
): ConversionResultsResult {
  const columns = new Map<string, RepConversionColumn>()
  for (const rep of reps) columns.set(rep.ownerId, emptyConversionColumn(rep.ownerId, rep.displayName))

  for (const activity of activities) {
    if (!CONNECTION_TYPES.has(activity.type)) continue
    const col = columns.get(activity.ownerId)
    if (col) col.connections += 1
  }
  for (const opp of opportunitiesCreated) {
    const col = columns.get(opp.ownerId)
    if (col) col.created += 1
  }
  for (const opp of opportunitiesWon) {
    const col = columns.get(opp.ownerId)
    if (col) col.won += 1
  }

  for (const col of columns.values()) {
    col.conversionRate = col.created === 0 ? null : col.won / col.created
  }

  const columnList = reps.map((rep) => columns.get(rep.ownerId)!)
  const teamTotals = columnList.reduce(
    (acc, col) => ({
      connections: acc.connections + col.connections,
      created: acc.created + col.created,
      won: acc.won + col.won,
    }),
    { connections: 0, created: 0, won: 0 },
  )
  const teamTotal: RepConversionColumn = {
    ownerId: '__team__',
    displayName: 'Team Total',
    connections: teamTotals.connections,
    created: teamTotals.created,
    won: teamTotals.won,
    conversionRate: teamTotals.created === 0 ? null : teamTotals.won / teamTotals.created,
  }

  return { columns: columnList, teamTotal }
}

// ---------------------------------------------------------------------------
// Widget 4: Pipeline — rep vs. rep
// ---------------------------------------------------------------------------

export interface RepPipelineRow {
  ownerId: string
  displayName: string
  /** Keyed by stage id, in the same order as the `stages` array returned
   * alongside this result. */
  byStage: Record<string, number>
  total: number
}

export interface PipelineResult {
  rows: RepPipelineRow[]
  /** The active stages, in admin-configured `order` — the caller renders
   * one stacked-bar segment per stage in this order. */
  stages: StageLike[]
}

/**
 * `opportunities` must already be the deduplicated union of the three
 * period queries (`unionOpportunities(created, won, lost)`) — an
 * opportunity created and won in the same period counts once, at its
 * *current* stage (per the brief), not once per matching query.
 *
 * An opportunity whose `stage` doesn't match any currently-active stage
 * (a retired/renamed stage id) is excluded from both the per-stage
 * segments and `total`, so the bar's segments always sum exactly to its
 * total — the same "visible segments equal the total" contract
 * `computeTotalOutput` follows for Team Total.
 */
export function computePipeline(
  opportunities: OpportunityLike[],
  stages: StageLike[],
  reps: RepDirectoryEntry[],
): PipelineResult {
  const orderedStages = [...stages].sort((a, b) => a.order - b.order)
  const stageIds = new Set(orderedStages.map((s) => s.id))

  const rows = new Map<string, RepPipelineRow>()
  for (const rep of reps) {
    const byStage: Record<string, number> = {}
    for (const stage of orderedStages) byStage[stage.id] = 0
    rows.set(rep.ownerId, { ownerId: rep.ownerId, displayName: rep.displayName, byStage, total: 0 })
  }

  for (const opp of opportunities) {
    if (!stageIds.has(opp.stage)) continue
    const row = rows.get(opp.ownerId)
    if (!row) continue
    row.byStage[opp.stage] += 1
    row.total += 1
  }

  return { rows: reps.map((rep) => rows.get(rep.ownerId)!), stages: orderedStages }
}
