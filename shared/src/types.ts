/**
 * Shared TypeScript types for the Brown Athletics Ticket Sales CRM.
 *
 * These interfaces describe the Firestore schema documented in the approved
 * Phase 1 design (§3 Firestore Schema & Security Rules). They are imported by
 * both /frontend and /functions via the npm workspace reference — this
 * package is never published.
 *
 * No business logic lives here — types only.
 */

/** Structural shape shared by both the client and Admin Firestore Timestamp
 * classes, so this package doesn't need to depend on either SDK. */
export interface FirestoreTimestamp {
  seconds: number
  nanoseconds: number
}

/** User role — two tiers only, per the approved design. */
export type Role = 'admin' | 'rep'

/** How the most recent contact interaction was made. */
export type LastContactMode = 'Email' | 'Phone' | 'In-Person' | 'Text' | 'Other'

/**
 * The 7 rep-activity types the sales-output dashboard buckets and counts.
 * Distinct from (and richer than) `LastContactMode` — `logContact` writes
 * both: an `Activity` doc with the precise `ActivityType`, and the legacy
 * `Contact.lastContactMode` via `ACTIVITY_TYPE_TO_LAST_CONTACT_MODE`'s
 * many-to-one mapping (`frontend/src/lib/firestore/contacts.ts`), since
 * `commitImport` and the manual contact-edit form still read/write the
 * 5-value legacy field.
 */
export type ActivityType =
  | 'Email'
  | 'Inbound Call'
  | 'Outbound Call - Talked To'
  | 'Outbound Call - VM'
  | 'Onsite Appointment'
  | 'Seat Visit'
  | 'Other'

/** The controlled vocabulary for `Opportunity.lostReason`'s dropdown (see
 * `LOST_REASONS` in `./constants` for the ordered list this type mirrors).
 * `Opportunity.lostReason` itself stays a plain `string`, not this type —
 * see that field's doc comment for why. */
export type LostReason =
  | 'Downgrade'
  | 'Not Approved'
  | 'Past Poor Fan Experience'
  | 'Too Many Games'
  | 'Cost'
  | 'Game Times'
  | 'Other'

/** Reserved identity-matching fields, shared by Contacts and Organizations,
 * for the future Paciolan sync (unused until phase 6). */
export interface ExternalIds {
  paciolanCustomerId: string | null
}

/** The 8 sponsored sports plus the two non-sport ticket categories. */
export type Sport =
  | 'Football'
  | "Men's Basketball"
  | "Women's Basketball"
  | "Men's Hockey"
  | "Women's Hockey"
  | 'Gymnastics'
  | "Men's Lacrosse"
  | "Women's Lacrosse"
  | 'Parking'
  | 'General'

/**
 * `users/{emailLower}` — keyed by lowercased email, not uid, since an
 * invited user doesn't have a uid yet.
 */
export interface User {
  email: string
  displayName: string
  photoURL: string
  /** Free-text title shown in the UI. */
  position: string
  role: Role
  active: boolean
  /** Populated on first sign-in via `linkAccount`. */
  authUid: string | null
  createdAt: FirestoreTimestamp
  createdBy: string
  /** Set once the account is linked; absent until then. */
  linkedAt?: FirestoreTimestamp
}

/**
 * `organizations/{orgId}` (auto-ID).
 */
export interface Organization {
  name: string
  /** Free-text tag (e.g. "Corporate", "Booster Club") — not a controlled
   * vocabulary in phase 1. */
  type: string
  phone: string
  /** Single-line text, not structured. */
  address: string
  ownerId: string
  externalIds: ExternalIds
  mergedInto: string | null
  searchTokens: string[]
  nameLower: string
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
  createdBy: string
}

/**
 * `contacts/{contactId}` (auto-ID).
 */
export interface Contact {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  /** Reference to `organizations`; replaces the earlier free-text field. */
  organizationId: string | null
  /** Denormalized copy of the linked org's name, kept in sync by a
   * Functions trigger. */
  organizationName?: string
  /** References a `statuses` doc — relationship/lifecycle status only. */
  status?: string
  lastContactDate?: FirestoreTimestamp
  lastContactMode?: LastContactMode
  ownerId: string
  source: 'manual' | 'import'
  externalIds: ExternalIds
  mergedInto: string | null
  /** Set by `commitImport` on Tier-3 (name-only) matches. */
  duplicateReviewStatus: 'flagged' | 'resolved' | null
  /** The existing contact a Tier-3 match thinks this one might duplicate. */
  possibleDuplicateOf: string | null
  searchTokens: string[]
  nameLower: string
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
  createdBy: string
  importBatchId: string | null
}

/**
 * `contacts/{contactId}/notes/{noteId}` — append-only for reps.
 */
export interface ContactNote {
  authorId: string
  /** Denormalized. */
  authorName: string
  text: string
  createdAt: FirestoreTimestamp
}

/**
 * `statuses/{statusId}` — admin-editable, config-driven relationship
 * statuses (never deal-stage language).
 */
export interface Status {
  label: string
  order: number
  /** Soft-delete so historical contacts referencing a retired status don't
   * break. */
  active: boolean
  /** Semantic badge token key. */
  color: string
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
}

/**
 * `opportunityStages/{stageId}` — admin-editable, config-driven pipeline
 * stages (deal-stage language belongs here).
 */
export interface OpportunityStage {
  label: string
  order: number
  active: boolean
  color: string
  /** At most one active stage is expected to carry each of these at a
   * time (the pipeline's terminal "won" stage), but nothing enforces that
   * structurally — `updateOpportunity`'s wonAt/lostAt maintenance reads
   * whichever stage doc the opportunity is being moved to/from. */
  isWon?: boolean
  /** The pipeline's terminal "lost" stage. See `isWon`'s comment. */
  isLost?: boolean
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
}

/**
 * `opportunities/{opportunityId}` (auto-ID) — one sales pursuit, distinct
 * from the contact's overall relationship.
 */
export interface Opportunity {
  contactId: string
  /** Set when the pursuit is at the org/account level. */
  organizationId: string | null
  sport: Sport
  /** References an `opportunityStages` doc. */
  stage: string
  /** Optional single text field — not a subcollection. */
  note?: string
  /** Free-text reason captured when the opportunity moves to a
   * `isLost: true` stage. One of `LOST_REASONS`, in UI, but stored as a
   * plain string rather than the narrower union so a retired/renamed
   * reason value on old data never becomes an invalid document. */
  lostReason?: string
  /** Set by `updateOpportunity` (`frontend/src/lib/firestore/
   * opportunities.ts`) the moment the opportunity transitions INTO a
   * stage with `OpportunityStage.isWon === true`, and never overwritten
   * on a later edit — this is what lets "won this month" mean "actually
   * closed this month," not "last edited while in a won stage." Cleared
   * (field deleted) if the opportunity transitions back out to a stage
   * that isn't `isWon`. */
  wonAt?: FirestoreTimestamp
  /** Same contract as `wonAt`, for `OpportunityStage.isLost === true`. */
  lostAt?: FirestoreTimestamp
  ownerId: string
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
  createdBy: string
}

/**
 * `activities/{activityId}` (auto-ID, top-level — NOT a subcollection of
 * `contacts`, so the sales-output dashboard can query/aggregate across
 * every rep's activity without a collection-group query). One doc per
 * rep-initiated contact interaction. Written only by the dedicated "Log
 * Contact" action (`frontend/src/lib/firestore/contacts.ts`'s
 * `logContact`, in the same `writeBatch` as the `Contact.lastContactDate`/
 * `lastContactMode` update it also performs) — never by the plain
 * contact-edit form, so correcting a typo in `lastContactMode` can never
 * inflate a rep's activity counts.
 */
export interface Activity {
  contactId: string
  /** Denormalized copy of the contact's full name at the time of logging,
   * so the dashboard never needs a per-activity contact lookup. */
  contactName: string
  /** Denormalized copy of the contact's `organizationId` at the time of
   * logging (mirrors `Contact.organizationId`'s nullability). */
  organizationId: string | null
  type: ActivityType
  /** The contact's *owning rep* — who this activity is credited to, not
   * necessarily who performed the action. Distinct from `createdBy` (the
   * acting user): the two coincide when a rep logs their own contact, but
   * diverge when an admin logs a contact on a rep's behalf — in that case
   * the activity is credited to the rep (`ownerId`), not the admin who
   * clicked the button (`createdBy`). This is the field the sales-output
   * dashboard's per-rep grouping/counting uses; `createdBy` is never used
   * for that purpose. */
  ownerId: string
  note?: string
  /** When the interaction actually happened (the Log Contact form's date
   * field) — distinct from `createdAt`, which is when the doc was
   * written. The dashboard's period filters range-query this field. */
  occurredAt: FirestoreTimestamp
  createdAt: FirestoreTimestamp
  createdBy: string
}

export type ImportBatchStatus =
  | 'mapping'
  | 'previewing'
  /** Written before any row is processed, so the batch doc always exists
   * before any contact tagged with its id can land durably in Firestore
   * (see `commitImport.ts`). A batch left at this status means the
   * function crashed/timed out mid-import — correctly non-revertable via
   * `revertImportBatch` (which requires `status === 'committed'`), and
   * still discoverable for manual cleanup. */
  | 'in_progress'
  | 'committed'
  | 'reverted'
  | 'partially_reverted'
  | 'failed'

export interface ImportBatchError {
  row: number
  message: string
}

export interface ImportBatchRevertSummary {
  revertedCount: number
  skippedCount: number
  skippedContactIds: string[]
}

/**
 * `importBatches/{batchId}` — written only by Cloud Functions (Admin SDK
 * bypasses rules).
 */
export interface ImportBatch {
  fileName: string
  uploadedBy: string
  uploadedAt: FirestoreTimestamp
  status: ImportBatchStatus
  /** Detected CSV header -> target field name (or "Ignore"). */
  columnMapping: Record<string, string>
  rowCount: number
  createdCount: number
  updatedCount: number
  errorCount: number
  possibleDuplicateCount: number
  /** Capped. */
  errors: ImportBatchError[]
  committedAt?: FirestoreTimestamp
  revertedAt: FirestoreTimestamp | null
  revertSummary: ImportBatchRevertSummary | null
}

/**
 * `importBatches/{batchId}/rows/{contactId}` — one doc per contact affected
 * by the batch, keyed by the affected contact's ID so undo never needs a
 * collection-scan query against `contacts`.
 */
export interface ImportBatchRow {
  action: 'created' | 'updated'
  /** Only the fields changed, with their pre-import values — empty for
   * `created` rows. */
  previousValues: Partial<Contact>
  /** The exact timestamp value written to the contact's `updatedAt`/
   * `createdAt` at commit time. */
  writtenAt: FirestoreTimestamp
}
