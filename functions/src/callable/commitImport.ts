/**
 * Callable: commits a client-parsed, column-mapped CSV import (approved
 * design §6.1-6.2 handle parsing/mapping client-side; this callable
 * receives already-structured rows). For each row:
 *
 *  1. Resolves the row's organization by exact case-insensitive name
 *     lookup, creating a minimal `organizations` doc if none exists.
 *  2. Runs tiered identity matching (`lib/identityMatching.ts`) against
 *     `contacts` — checking an in-import in-memory index first (see "Dedup
 *     within a single import" below) before falling back to Firestore.
 *  3. Tier 1/2 match -> updates the existing contact, recording only the
 *     fields that actually changed in `previousValues` (plus `updatedAt`,
 *     which always changes on a touched row).
 *     Tier 3 match, or no match -> creates a new contact (`source:
 *     'import'`); a Tier 3 match additionally flags it as a possible
 *     duplicate (never auto-merged).
 *
 * Writes one `importBatches` doc and one `importBatches/{id}/rows/{
 * contactId}` doc per affected contact. Firestore writes are chunked at the
 * 500-per-commit limit via `lib/batchWriter.ts`.
 *
 * `writtenAt` fix (approved design review pass): the row doc's `writtenAt`
 * must be the *exact* value written to the contact's `updatedAt`/
 * `createdAt` in this same operation. Two independent
 * `FieldValue.serverTimestamp()` sentinels resolve to two different
 * server-side instants even inside the same batch commit, so revert's
 * exact-timestamp equality check would never hold. Instead, each affected
 * contact gets one concrete `Timestamp.now()` value (an Admin-SDK-clock
 * timestamp, not a server sentinel) that's written verbatim to both the
 * contact and its row doc — literally the same value, not two independently
 * resolved ones.
 *
 * Atomicity (fix round 1, finding 2): the `importBatches` doc is written
 * FIRST — before any row is processed — as the very first op queued into
 * `writer`, at `status: 'in_progress'`. `BatchWriter` flushes every 500 ops
 * as one atomic Firestore commit, so this doc is always part of the SAME
 * commit as the earliest contact writes; no contact tagged with this
 * batch's id can ever land durably without the batch doc also existing. The
 * doc is flipped to `status: 'committed'` (with final counts) as the very
 * last write, once every row has been processed. A crash/timeout mid-import
 * leaves the doc at `'in_progress'` — `revertImportBatch` requires
 * `status === 'committed'`, so a partial import is correctly non-revertable
 * via that path, and still discoverable for manual cleanup (rather than
 * silently having no batch doc at all).
 *
 * Dedup within a single import (fix round 1, finding 3): all contact writes
 * are deferred to a finalization pass over an in-memory `pending` map keyed
 * by contact id, built up across the whole row loop, instead of writing
 * each row's contact immediately. Three in-memory indices (email, phone,
 * name — the same signals `identityMatching`'s tiers key on) are checked
 * BEFORE falling back to a Firestore-backed `findIdentityMatch` query, so
 * two rows in the same file that share a new identity always resolve to the
 * same single contact regardless of where a 500-op batch flush happens to
 * land — the previous, non-deferred version could otherwise produce two
 * separate contacts, or one create + one update, non-deterministically. It
 * also means each affected contact gets written (and counted, and given a
 * `rows/{contactId}` doc) exactly once even when multiple rows in the file
 * target it — later rows win on field values, but the recorded
 * `previousValues` always anchors to the contact's true pre-import state,
 * never an intermediate value written earlier in the same import. (Deferring
 * writes to one pass is also required independent of dedup: a Firestore
 * `WriteBatch` rejects more than one write to the same document within a
 * single commit, so a contact touched by two rows could never safely be
 * both `set()` and `update()` — or `update()` twice — in a write-as-you-go
 * structure.)
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import type { Contact, ImportBatch, LastContactMode, Organization } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { requireActiveUser } from '../lib/config'
import { findIdentityMatch, normalizeEmailForMatching, type IdentityMatchResult } from '../lib/identityMatching'
import { computeContactSearchTokens, computeNameLower, computeOrgSearchTokens, digitsOnly } from '../lib/searchTokens'
import { BatchWriter } from '../lib/batchWriter'

export interface CommitImportRow {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  organizationName?: string
  status?: string
  /** ISO-ish date string; parsed leniently, ignored if unparseable. */
  lastContactDate?: string
  lastContactMode?: LastContactMode
}

export interface CommitImportData {
  fileName: string
  rows: CommitImportRow[]
  /** Applied to newly created contacts only — never reassigns ownership of
   * an existing (matched) contact. */
  defaultOwnerId: string
  /** Applied to newly created contacts whose row has no status. */
  defaultStatus?: string
  columnMapping?: Record<string, string>
}

export interface CommitImportRowError {
  row: number
  message: string
}

export interface CommitImportResult {
  importBatchId: string
  createdCount: number
  updatedCount: number
  possibleDuplicateCount: number
  errorCount: number
  errors: CommitImportRowError[]
}

const LAST_CONTACT_MODES: ReadonlySet<string> = new Set([
  'Email',
  'Phone',
  'In-Person',
  'Text',
  'Other',
])
const MAX_REPORTED_ERRORS = 50

function parseLastContactDate(value: string | undefined): Timestamp | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return undefined
  return Timestamp.fromDate(date)
}

function parseLastContactMode(value: string | undefined): LastContactMode | undefined {
  if (value && LAST_CONTACT_MODES.has(value)) return value as LastContactMode
  return undefined
}

/** Structural equality for the mix of scalars and `Timestamp`s stored on a
 * `Contact` — plain `Timestamp` objects don't compare equal with `===`
 * even when they represent the same instant. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a && b && typeof (a as { isEqual?: unknown }).isEqual === 'function') {
    return (a as { isEqual: (other: unknown) => boolean }).isEqual(b)
  }
  return false
}

interface OrgResolution {
  id: string
  name: string
}

async function resolveOrganization(
  orgNameRaw: string,
  cache: Map<string, OrgResolution>,
  ownerId: string,
  createdBy: string,
  writer: BatchWriter,
): Promise<OrgResolution> {
  const orgNameLower = orgNameRaw.toLowerCase()
  const cached = cache.get(orgNameLower)
  if (cached) return cached

  const existing = await db
    .collection('organizations')
    .where('nameLower', '==', orgNameLower)
    .limit(1)
    .get()
  if (!existing.empty) {
    const doc = existing.docs[0]!
    const data = doc.data() as Organization
    const result = { id: doc.id, name: data.name }
    cache.set(orgNameLower, result)
    return result
  }

  const ref = db.collection('organizations').doc()
  const now = Timestamp.now()
  await writer.set(ref, {
    name: orgNameRaw,
    type: '',
    phone: '',
    address: '',
    ownerId,
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    searchTokens: computeOrgSearchTokens(orgNameRaw),
    nameLower: orgNameLower,
    createdAt: now,
    updatedAt: now,
    createdBy,
  })
  const result = { id: ref.id, name: orgNameRaw }
  cache.set(orgNameLower, result)
  return result
}

interface IncomingFields {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  organizationId?: string | null
  organizationName?: string
  status?: string
  lastContactDate?: Timestamp
  lastContactMode?: LastContactMode
}

function diffAndBuildUpdate(
  existing: Contact,
  incoming: IncomingFields,
): { updates: Record<string, unknown>; previousValues: Partial<Contact> } {
  const updates: Record<string, unknown> = {}
  const previousValues: Record<string, unknown> = {}

  const setIfChanged = (field: keyof Contact, newValue: unknown) => {
    if (newValue === undefined) return // row didn't supply this field — leave untouched
    const oldValue = (existing as unknown as Record<string, unknown>)[field]
    if (!valuesEqual(oldValue, newValue)) {
      updates[field] = newValue
      previousValues[field] = oldValue === undefined ? null : oldValue
    }
  }

  setIfChanged('firstName', incoming.firstName)
  setIfChanged('lastName', incoming.lastName)
  setIfChanged('email', incoming.email)
  setIfChanged('phone', incoming.phone)
  setIfChanged('organizationId', incoming.organizationId)
  setIfChanged('organizationName', incoming.organizationName)
  setIfChanged('status', incoming.status)
  setIfChanged('lastContactDate', incoming.lastContactDate)
  setIfChanged('lastContactMode', incoming.lastContactMode)

  return { updates, previousValues: previousValues as Partial<Contact> }
}

/** Applies a cumulative `updates` object on top of a base `Contact`
 * snapshot, so a later row in the same import can be diffed against the
 * contact's current (not-yet-written) in-memory state rather than its
 * original pre-import Firestore snapshot. */
function applyPendingUpdates(base: Contact, updates: Record<string, unknown>): Contact {
  return { ...base, ...updates } as Contact
}

interface PendingCreate {
  kind: 'create'
  ref: DocumentReference
  data: Record<string, unknown>
  isDuplicate: boolean
  writtenAt: Timestamp
}

interface PendingUpdate {
  kind: 'update'
  ref: DocumentReference
  /** The contact's true pre-import Firestore snapshot — never mutated, so
   * `previousValues` can always be anchored to it regardless of how many
   * rows in this import touch the contact. */
  original: Contact
  /** Cumulative field updates across every row in this import that touched
   * this contact — last row wins per field. */
  updates: Record<string, unknown>
  /** Cumulative previous-values across every row — a field is recorded
   * here only the first time it changes relative to `original`. */
  previousValues: Record<string, unknown>
  writtenAt: Timestamp
}

type PendingContact = PendingCreate | PendingUpdate

export const commitImport = onCall<CommitImportData>(async (request) => {
  const caller = await requireActiveUser(request.auth)

  const data = request.data
  if (typeof data?.fileName !== 'string' || data.fileName.trim() === '') {
    throw new HttpsError('invalid-argument', 'fileName is required.')
  }
  if (!Array.isArray(data.rows) || data.rows.length === 0) {
    throw new HttpsError('invalid-argument', 'rows must be a non-empty array.')
  }
  if (typeof data.defaultOwnerId !== 'string' || data.defaultOwnerId.trim() === '') {
    throw new HttpsError('invalid-argument', 'defaultOwnerId is required.')
  }
  const defaultOwnerId = data.defaultOwnerId
  const defaultStatus = data.defaultStatus?.trim() || undefined

  const batchRef = db.collection('importBatches').doc()
  const rowsCollection = batchRef.collection('rows')
  const writer = new BatchWriter()
  const orgCache = new Map<string, OrgResolution>()

  // Written first — see the "Atomicity" doc comment at the top of this
  // file. Placeholder counts get overwritten by the final `status:
  // 'committed'` write below.
  await writer.set(batchRef, {
    fileName: data.fileName,
    uploadedBy: caller.uid,
    uploadedAt: Timestamp.now(),
    status: 'in_progress',
    columnMapping: data.columnMapping ?? {},
    rowCount: data.rows.length,
    createdCount: 0,
    updatedCount: 0,
    errorCount: 0,
    possibleDuplicateCount: 0,
    errors: [],
    revertedAt: null,
    revertSummary: null,
  } satisfies ImportBatch)

  const errors: CommitImportRowError[] = []

  // In-import dedup state — see the "Dedup within a single import" doc
  // comment at the top of this file.
  const pending = new Map<string, PendingContact>()
  const localEmailIndex = new Map<string, string>() // emailLower -> contactId
  const localPhoneIndex = new Map<string, string>() // phoneDigits -> contactId (only entries whose row had no email)
  const localNameIndex = new Map<string, string>() // nameLower -> contactId

  const findLocalMatch = (
    emailLower: string,
    phoneDigits: string,
    nameLower: string,
  ): IdentityMatchResult | null => {
    if (emailLower) {
      const id = localEmailIndex.get(emailLower)
      if (id) return { tier: 1, id }
    }
    if (!emailLower && phoneDigits) {
      const id = localPhoneIndex.get(phoneDigits)
      if (id) return { tier: 2, id }
    }
    if (nameLower) {
      const id = localNameIndex.get(nameLower)
      if (id) return { tier: 3, id }
    }
    return null
  }

  const registerLocalIndices = (id: string, emailLower: string, phoneDigits: string, nameLower: string): void => {
    if (emailLower) localEmailIndex.set(emailLower, id)
    else if (phoneDigits) localPhoneIndex.set(phoneDigits, id)
    if (nameLower) localNameIndex.set(nameLower, id)
  }

  for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
    const row = data.rows[rowIndex]!

    const firstNameRaw = row.firstName?.trim() ?? ''
    const lastNameRaw = row.lastName?.trim() ?? ''
    const emailRaw = row.email?.trim() ?? ''
    const phoneRaw = row.phone?.trim() ?? ''
    const orgNameRaw = row.organizationName?.trim() ?? ''
    const statusRaw = row.status?.trim() ?? ''
    const lastContactDateTs = parseLastContactDate(row.lastContactDate)
    const lastContactMode = parseLastContactMode(row.lastContactMode)

    if (!firstNameRaw && !lastNameRaw && !emailRaw && !phoneRaw) {
      errors.push({ row: rowIndex, message: 'Row has no name, email, or phone — nothing to import.' })
      continue
    }

    let org: OrgResolution | null = null
    if (orgNameRaw) {
      org = await resolveOrganization(orgNameRaw, orgCache, defaultOwnerId, caller.uid, writer)
    }

    const emailLower = normalizeEmailForMatching(emailRaw)
    const phoneDigits = phoneRaw ? digitsOnly(phoneRaw) : ''
    const nameLower = computeNameLower(firstNameRaw, lastNameRaw)

    let match: IdentityMatchResult | null = findLocalMatch(emailLower, phoneDigits, nameLower)
    if (!match) {
      match = await findIdentityMatch(
        {
          email: emailRaw || undefined,
          phone: phoneRaw || undefined,
          firstName: firstNameRaw,
          lastName: lastNameRaw,
        },
        { collection: 'contacts' },
      )
    }

    if (match && match.tier !== 3) {
      const incoming: IncomingFields = {
        firstName: firstNameRaw || undefined,
        lastName: lastNameRaw || undefined,
        email: emailRaw || undefined,
        phone: phoneRaw || undefined,
        organizationId: org ? org.id : undefined,
        organizationName: org ? org.name : undefined,
        status: statusRaw || undefined,
        lastContactDate: lastContactDateTs,
        lastContactMode,
      }

      const existingPending = pending.get(match.id)

      if (existingPending && existingPending.kind === 'create') {
        // Contact was created earlier in this same import — merge this
        // row's fields directly into the still-unwritten create payload
        // (last row wins). There's nothing to "revert" beyond the single
        // create either way, so no previousValues bookkeeping is needed.
        const mergedData = existingPending.data
        if (incoming.firstName !== undefined) mergedData.firstName = incoming.firstName
        if (incoming.lastName !== undefined) mergedData.lastName = incoming.lastName
        if (incoming.email !== undefined) mergedData.email = incoming.email
        if (incoming.phone !== undefined) mergedData.phone = incoming.phone
        if (incoming.organizationId !== undefined) mergedData.organizationId = incoming.organizationId
        if (incoming.organizationName !== undefined) mergedData.organizationName = incoming.organizationName
        if (incoming.status !== undefined) mergedData.status = incoming.status
        if (incoming.lastContactDate !== undefined) mergedData.lastContactDate = incoming.lastContactDate
        if (incoming.lastContactMode !== undefined) mergedData.lastContactMode = incoming.lastContactMode
        const mergedFirstName = (mergedData.firstName as string | undefined) ?? ''
        const mergedLastName = (mergedData.lastName as string | undefined) ?? ''
        mergedData.nameLower = computeNameLower(mergedFirstName, mergedLastName)
        mergedData.searchTokens = computeContactSearchTokens({
          firstName: mergedFirstName,
          lastName: mergedLastName,
          email: mergedData.email as string | undefined,
          phone: mergedData.phone as string | undefined,
          organizationName: mergedData.organizationName as string | undefined,
        })
      } else if (existingPending && existingPending.kind === 'update') {
        const current = applyPendingUpdates(existingPending.original, existingPending.updates)
        const { updates: newUpdates, previousValues: newPrev } = diffAndBuildUpdate(current, incoming)
        Object.assign(existingPending.updates, newUpdates)
        for (const [key, value] of Object.entries(newPrev)) {
          if (!(key in existingPending.previousValues)) existingPending.previousValues[key] = value
        }
      } else {
        // First time this import has touched this contact — a fresh local
        // match always has a `pending` entry already (that's how it got
        // indexed), so reaching here means the match came from Firestore:
        // a genuine pre-existing record.
        const contactRef = db.collection('contacts').doc(match.id)
        const existingSnap = await contactRef.get()
        if (!existingSnap.exists) {
          // Matched doc vanished between the query and this read —
          // extremely unlikely, but fail this row loudly rather than
          // writing garbage.
          errors.push({ row: rowIndex, message: `Matched contact ${match.id} no longer exists.` })
          continue
        }
        const existing = existingSnap.data() as Contact
        const writtenAt = Timestamp.now()
        const { updates, previousValues } = diffAndBuildUpdate(existing, incoming)
        updates.updatedAt = writtenAt
        previousValues.updatedAt = existing.updatedAt
        pending.set(match.id, {
          kind: 'update',
          ref: contactRef,
          original: existing,
          updates,
          previousValues,
          writtenAt,
        })
      }

      registerLocalIndices(match.id, emailLower, phoneDigits, nameLower)
    } else {
      const isDuplicate = match?.tier === 3
      const contactRef = db.collection('contacts').doc()
      const writtenAt = Timestamp.now()

      const contactData: Record<string, unknown> = {
        firstName: firstNameRaw,
        lastName: lastNameRaw,
        organizationId: org ? org.id : null,
        ownerId: defaultOwnerId,
        source: 'import',
        externalIds: { paciolanCustomerId: null },
        // Per firestore.rules' documented invariant, these four fields
        // must always be set explicitly at contact creation, even to
        // `null` — omitting any of them would permanently block the
        // owning rep from ever updating this contact again.
        mergedInto: null,
        duplicateReviewStatus: isDuplicate ? 'flagged' : null,
        possibleDuplicateOf: isDuplicate ? match!.id : null,
        nameLower,
        searchTokens: computeContactSearchTokens({
          firstName: firstNameRaw,
          lastName: lastNameRaw,
          email: emailRaw || undefined,
          phone: phoneRaw || undefined,
          organizationName: org?.name,
        }),
        createdAt: writtenAt,
        updatedAt: writtenAt,
        createdBy: caller.uid,
        importBatchId: batchRef.id,
      }
      if (org) contactData.organizationName = org.name
      if (emailRaw) contactData.email = emailRaw
      if (phoneRaw) contactData.phone = phoneRaw
      const status = statusRaw || defaultStatus
      if (status) contactData.status = status
      if (lastContactDateTs) contactData.lastContactDate = lastContactDateTs
      if (lastContactMode) contactData.lastContactMode = lastContactMode

      pending.set(contactRef.id, {
        kind: 'create',
        ref: contactRef,
        data: contactData,
        isDuplicate,
        writtenAt,
      })

      registerLocalIndices(contactRef.id, emailLower, phoneDigits, nameLower)
    }
  }

  let createdCount = 0
  let updatedCount = 0
  let possibleDuplicateCount = 0

  for (const [contactId, entry] of pending) {
    if (entry.kind === 'create') {
      await writer.set(entry.ref, entry.data)
      await writer.set(rowsCollection.doc(contactId), {
        action: 'created',
        previousValues: {},
        writtenAt: entry.writtenAt,
      })
      createdCount += 1
      if (entry.isDuplicate) possibleDuplicateCount += 1
    } else {
      await writer.update(entry.ref, entry.updates)
      await writer.set(rowsCollection.doc(contactId), {
        action: 'updated',
        previousValues: entry.previousValues,
        writtenAt: entry.writtenAt,
      })
      updatedCount += 1
    }
  }

  const reportedErrors = errors.slice(0, MAX_REPORTED_ERRORS)
  // Last write: flips the batch doc from 'in_progress' to 'committed' with
  // final counts — see the "Atomicity" doc comment at the top of this file.
  await writer.update(batchRef, {
    status: 'committed',
    createdCount,
    updatedCount,
    errorCount: errors.length,
    possibleDuplicateCount,
    errors: reportedErrors,
    committedAt: Timestamp.now(),
  })
  await writer.commit()

  return {
    importBatchId: batchRef.id,
    createdCount,
    updatedCount,
    possibleDuplicateCount,
    errorCount: errors.length,
    errors: reportedErrors,
  } satisfies CommitImportResult
})
