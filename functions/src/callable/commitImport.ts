/**
 * Callable: commits a client-parsed, column-mapped CSV import (approved
 * design §6.1-6.2 handle parsing/mapping client-side; this callable
 * receives already-structured rows). For each row:
 *
 *  1. Resolves the row's organization by exact case-insensitive name
 *     lookup, creating a minimal `organizations` doc if none exists.
 *  2. Runs tiered identity matching (`lib/identityMatching.ts`) against
 *     `contacts`.
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
 * exact-timestamp equality check would never hold. Instead, each row gets
 * one concrete `Timestamp.now()` value (an Admin-SDK-clock timestamp, not a
 * server sentinel) that's written verbatim to both the contact and its row
 * doc — literally the same value, not two independently-resolved ones.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import type { Contact, LastContactMode, Organization } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { requireActiveUser } from '../lib/config'
import { findIdentityMatch } from '../lib/identityMatching'
import { computeContactSearchTokens, computeNameLower, computeOrgSearchTokens } from '../lib/searchTokens'
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
    const oldValue = (existing as Record<string, unknown>)[field]
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
  const writer = new BatchWriter()
  const orgCache = new Map<string, OrgResolution>()

  let createdCount = 0
  let updatedCount = 0
  let possibleDuplicateCount = 0
  const errors: CommitImportRowError[] = []

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

    const match = await findIdentityMatch(
      {
        email: emailRaw || undefined,
        phone: phoneRaw || undefined,
        firstName: firstNameRaw,
        lastName: lastNameRaw,
      },
      { collection: 'contacts' },
    )

    const writtenAt = Timestamp.now()
    const rowsCollection = batchRef.collection('rows')

    if (match && match.tier !== 3) {
      const contactRef = db.collection('contacts').doc(match.id)
      const existingSnap = await contactRef.get()
      if (!existingSnap.exists) {
        // Matched doc vanished between the query and this read — extremely
        // unlikely, but fail this row loudly rather than writing garbage.
        errors.push({ row: rowIndex, message: `Matched contact ${match.id} no longer exists.` })
        continue
      }
      const existing = existingSnap.data() as Contact

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
      const { updates, previousValues } = diffAndBuildUpdate(existing, incoming)
      updates.updatedAt = writtenAt
      previousValues.updatedAt = existing.updatedAt

      await writer.update(contactRef, updates)
      await writer.set(rowsCollection.doc(contactRef.id), {
        action: 'updated',
        previousValues,
        writtenAt,
      })
      updatedCount += 1
    } else {
      const isDuplicate = match?.tier === 3
      const contactRef = db.collection('contacts').doc()

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
        nameLower: computeNameLower(firstNameRaw, lastNameRaw),
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

      await writer.set(contactRef, contactData)
      await writer.set(rowsCollection.doc(contactRef.id), {
        action: 'created',
        previousValues: {},
        writtenAt,
      })
      createdCount += 1
      if (isDuplicate) possibleDuplicateCount += 1
    }
  }

  const reportedErrors = errors.slice(0, MAX_REPORTED_ERRORS)
  await writer.set(batchRef, {
    fileName: data.fileName,
    uploadedBy: caller.uid,
    uploadedAt: Timestamp.now(),
    status: 'committed',
    columnMapping: data.columnMapping ?? {},
    rowCount: data.rows.length,
    createdCount,
    updatedCount,
    errorCount: errors.length,
    possibleDuplicateCount,
    errors: reportedErrors,
    committedAt: Timestamp.now(),
    revertedAt: null,
    revertSummary: null,
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
