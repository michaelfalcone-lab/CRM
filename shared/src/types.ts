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
  ownerId: string
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
  createdBy: string
}

export type ImportBatchStatus =
  'mapping' | 'previewing' | 'committed' | 'reverted' | 'partially_reverted' | 'failed'

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
