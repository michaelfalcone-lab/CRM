/**
 * Pure aggregation functions for the sales-output dashboard. No Firestore,
 * no React — every function here takes plain arrays/objects already
 * fetched by `useDashboardData` and returns plain result objects, so the
 * dashboard's actual math is fully unit-testable without a browser or
 * emulator. Components (`TotalOutputChart`, `ConnectionRateGauge`,
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
import { WIN_ACTIVITY_TYPES } from 'shared'

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
 * Pipeline widget's per-stage segments. `isWon`/`isLost` aren't read by
 * `computePipeline` itself (grouping is purely by `stage` id/`order`) but
 * are carried through so `PipelineChart` can pick each segment's color
 * off the flags rather than hardcoding a stage id. */
export interface StageLike {
  id: string
  label: string
  order: number
  color: string
  isWon?: boolean
  isLost?: boolean
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

/** `ActivityType` -> Total Output bucket. Every activity in the period is
 * bucketed by method through this table — there is no longer a special
 * "first touch of a contact" bucket. `Other` (and any unrecognized type)
 * falls to `followUps`, the catch-all for a touch that isn't a
 * recognized call/email/meeting. */
const TOUCH_BUCKET: Record<ActivityType, 'calls' | 'emails' | 'meetings' | 'followUps'> = {
  'Inbound Call': 'calls',
  'Outbound Call - Talked To': 'calls',
  'Outbound Call - VM': 'calls',
  // Replies bucket with the channel they came back on, so Total Output
  // still reads as "volume by channel" rather than growing two new
  // segments for what is the same conversation.
  'Voicemail Returned': 'calls',
  'Email Reply Received': 'emails',
  Email: 'emails',
  'Onsite Appointment': 'meetings',
  Other: 'followUps',
}

export interface RepOutputRow {
  ownerId: string
  displayName: string
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
  return { ownerId, displayName, calls: 0, emails: 0, meetings: 0, followUps: 0, total: 0 }
}

/**
 * Bucketing rule: every activity in the period counts once, bucketed by
 * its `type` via `TOUCH_BUCKET`, and credited to the rep in the
 * activity's own `ownerId` (a snapshot at log time — so a contact
 * reassigned mid-period splits its touches across both reps' rows, which
 * is correct: each rep is credited with the work they actually logged).
 *
 * An earlier version singled out each contact's chronologically first
 * touch in the period as a separate "Initial Outreach" bucket, which is
 * why this used to group by `contactId` and sort. That bucket was
 * removed: a first call is a call. Nothing here depends on activity
 * order any more, so the grouping and sort are gone with it.
 */
export function computeTotalOutput(
  activities: ActivityLike[],
  reps: RepDirectoryEntry[],
): TotalOutputResult {
  const rows = new Map<string, RepOutputRow>()
  for (const rep of reps) rows.set(rep.ownerId, emptyOutputRow(rep.ownerId, rep.displayName))

  for (const activity of activities) {
    const row = rows.get(activity.ownerId)
    if (!row) continue // ownerId not in the current active directory — see teamTotal's doc comment
    row.total += 1
    // `TOUCH_BUCKET[activity.type]` is `undefined` for a `type` outside
    // the current `ActivityType` union — legacy data, or an activity
    // created by `commitImport` from an imported CSV whose type string
    // doesn't (or no longer) matches exactly. Without the `?? 'followUps'`
    // fallback, `row[undefined]` silently creates a stray `NaN` property
    // on the row rather than throwing or losing the count — lossy AND
    // silent. Follow-ups is the catch-all bucket for "a touch that isn't
    // a recognized call/email/meeting", so it's the correct home for an
    // unrecognized type too.
    row[TOUCH_BUCKET[activity.type] ?? 'followUps'] += 1
  }

  const rowList = reps.map((rep) => rows.get(rep.ownerId)!)
  const teamTotal = rowList.reduce(
    (acc, row) => ({
      ownerId: '__team__',
      displayName: 'Team Total',
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
// Widget 2: Connection Rate
// ---------------------------------------------------------------------------

/**
 * The activity types that mark a contact as having CONNECTED (responded)
 * — imported from `shared` rather than defined here now, since it's also
 * used by `frontend/src/lib/statusWorkflow.ts` to drive Active→Warm status
 * advancement (a `lib/` module can't import a `features/` module in this
 * codebase's layering, so the shared home is the one both sides can use).
 * Its name predates the "Connection Rate" label and is deliberately left
 * alone — renaming it would churn the status workflow for no behaviour
 * change. See its doc comment in `shared/src/constants.ts`.
 */
const WIN_ACTIVITY_TYPE_SET: ReadonlySet<ActivityType> = new Set(WIN_ACTIVITY_TYPES)

export interface ConnectionRateResult {
  /** Distinct contacts with at least one qualifying connection, ever. */
  connectedCount: number
  /** All contacts owned by a rep in the directory. */
  totalCount: number
  /** `connectedCount / totalCount`, or `null` when there are no contacts
   * at all — callers must render that explicitly (e.g. "—"), never coerce
   * to 0%, which would read as "nobody connects" rather than "no data". */
  rate: number | null
}

export interface ContactLike {
  id: string
  ownerId: string
}

export interface ResponseActivityLike {
  contactId: string
  type: ActivityType
}

/**
 * The dashboard's "Connection Rate": of every contact the team owns, what
 * share have actually connected back (answered, replied, or returned a
 * voicemail). Formerly labelled "Win Rate" — same calculation.
 *
 * Deliberately NOT period-scoped, unlike every other widget — it answers
 * "of everyone we're responsible for, how many have ever engaged", which
 * is a coverage question, not a this-month question. Both halves are
 * all-time so the ratio stays internally consistent; a windowed numerator
 * over an all-time denominator would drift toward zero as the window
 * shrinks and read as a collapse in performance.
 *
 * Counts distinct CONTACTS, not activities — five replies from one
 * prospect is one responsive contact, not five. `connectedCount` can
 * therefore never exceed `totalCount`, including when activity exists for
 * a contact outside the given set (deleted, merged away, or owned by
 * someone off the directory): such activity is ignored rather than
 * counted, which would otherwise render as a rate above 100%.
 */
export function computeConnectionRate(
  contacts: ContactLike[],
  activities: ResponseActivityLike[],
  reps: RepDirectoryEntry[],
): ConnectionRateResult {
  const repIds = new Set(reps.map((rep) => rep.ownerId))
  const ownedContactIds = new Set(
    contacts.filter((contact) => repIds.has(contact.ownerId)).map((contact) => contact.id),
  )

  const responded = new Set<string>()
  for (const activity of activities) {
    if (!WIN_ACTIVITY_TYPE_SET.has(activity.type)) continue
    // Only contacts actually in the denominator can count toward the
    // numerator — see this function's doc comment.
    if (!ownedContactIds.has(activity.contactId)) continue
    responded.add(activity.contactId)
  }

  const totalCount = ownedContactIds.size
  return {
    connectedCount: responded.size,
    totalCount,
    rate: totalCount === 0 ? null : responded.size / totalCount,
  }
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
