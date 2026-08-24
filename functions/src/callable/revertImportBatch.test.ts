/**
 * Unit tests for `revertImportBatch`, run against the Firestore Local
 * Emulator Suite via `npm run test:functions`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { Contact, ImportBatch, User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { computeContactSearchTokens, computeNameLower } from '../lib/searchTokens'
import { commitImport, type CommitImportData } from './commitImport'
import { revertImportBatch, type RevertImportBatchData } from './revertImportBatch'

const ADMIN_UID = 'admin-uid-revert'
const ADMIN_EMAIL = 'admin-revert@brown.edu'
const REP_UID = 'rep-uid-revert'
const REP_EMAIL = 'rep-revert@brown.edu'
const DEFAULT_OWNER_ID = 'owner-revert-1'

async function seedUsers() {
  await db.collection('users').doc(ADMIN_EMAIL).set({
    email: ADMIN_EMAIL,
    displayName: 'Admin',
    photoURL: '',
    position: '',
    role: 'admin',
    active: true,
    authUid: ADMIN_UID,
    createdAt: Timestamp.now(),
    createdBy: 'seed-script',
  } satisfies User)
  await db.collection('users').doc(REP_EMAIL).set({
    email: REP_EMAIL,
    displayName: 'Rep',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: REP_UID,
    createdAt: Timestamp.now(),
    createdBy: 'seed-script',
  } satisfies User)
}

async function seedContact(id: string, fields: Partial<Contact> & { firstName: string; lastName: string }) {
  const data: Record<string, unknown> = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    organizationId: fields.organizationId ?? null,
    ownerId: fields.ownerId ?? DEFAULT_OWNER_ID,
    source: fields.source ?? 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    nameLower: computeNameLower(fields.firstName, fields.lastName),
    searchTokens: computeContactSearchTokens(fields),
    createdAt: fields.createdAt ?? new Date(),
    updatedAt: fields.updatedAt ?? new Date(),
    createdBy: fields.createdBy ?? DEFAULT_OWNER_ID,
    importBatchId: fields.importBatchId ?? null,
  }
  if (fields.email) data.email = fields.email
  if (fields.phone) data.phone = fields.phone
  if (fields.status) data.status = fields.status
  await db.collection('contacts').doc(id).set(data)
}

function runCommitImport(data: CommitImportData) {
  return commitImport.run(callableRequest(data, fakeAuth(REP_UID, REP_EMAIL)))
}

function runRevert(data: RevertImportBatchData, uid = ADMIN_UID, email = ADMIN_EMAIL) {
  return revertImportBatch.run(callableRequest(data, fakeAuth(uid, email)))
}

async function clearCollection(name: string) {
  const refs = await db.collection(name).listDocuments()
  await Promise.all(refs.map((ref) => ref.delete()))
}

describe('revertImportBatch', () => {
  beforeEach(async () => {
    await seedUsers()
    await clearCollection('contacts')
    await clearCollection('organizations')
    await clearCollection('importBatches')
  })

  it('rejects a non-admin caller', async () => {
    const commit = await runCommitImport({
      fileName: 'reject.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'A', lastName: 'B', email: 'a-b@example.com' }],
    })

    await expect(
      runRevert({ importBatchId: commit.importBatchId }, REP_UID, REP_EMAIL),
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('fully reverts a batch of newly created contacts and never deletes organizations created during import', async () => {
    const commit = await runCommitImport({
      fileName: 'full-revert.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'One', lastName: 'Created', email: 'one-created@example.com', organizationName: 'Revert Org' },
        { firstName: 'Two', lastName: 'Created', email: 'two-created@example.com', organizationName: 'Revert Org' },
      ],
    })
    expect(commit.createdCount).toBe(2)
    const orgsBeforeRevert = await db.collection('organizations').get()
    expect(orgsBeforeRevert.size).toBe(1)

    const result = await runRevert({ importBatchId: commit.importBatchId })

    expect(result.status).toBe('reverted')
    expect(result.revertedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
    expect(result.skippedContactIds).toEqual([])

    const contactsAfter = await db.collection('contacts').get()
    expect(contactsAfter.size).toBe(0)

    // Organizations created during the import are never deleted by revert.
    const orgsAfterRevert = await db.collection('organizations').get()
    expect(orgsAfterRevert.size).toBe(1)

    const batchDoc = (await db.collection('importBatches').doc(commit.importBatchId).get()).data() as ImportBatch
    expect(batchDoc.status).toBe('reverted')
    expect(batchDoc.revertSummary).toEqual({ revertedCount: 2, skippedCount: 0, skippedContactIds: [] })
    expect(batchDoc.revertedAt).not.toBeNull()
  })

  it('partial revert: a created-then-edited-since-import contact is skipped, others are reverted', async () => {
    const commit = await runCommitImport({
      fileName: 'partial-created.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        { firstName: 'Untouched', lastName: 'Created', email: 'untouched-created@example.com' },
        { firstName: 'Edited', lastName: 'Created', email: 'edited-created@example.com' },
      ],
    })
    expect(commit.createdCount).toBe(2)

    const editedRow = await db
      .collection('contacts')
      .where('email', '==', 'edited-created@example.com')
      .limit(1)
      .get()
    const editedContactId = editedRow.docs[0]!.id
    // Simulate a real edit made after the import (e.g. via the UI). A real
    // edit path always sets `updatedAt` explicitly on write (Firestore
    // never bumps it automatically) — that's what the exact-timestamp
    // check in `revertImportBatch` relies on to detect drift away from the
    // row's recorded `writtenAt`.
    await db
      .collection('contacts')
      .doc(editedContactId)
      .update({ phone: '4015559999', updatedAt: Timestamp.now() })

    const result = await runRevert({ importBatchId: commit.importBatchId })

    expect(result.status).toBe('partially_reverted')
    expect(result.revertedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.skippedContactIds).toEqual([editedContactId])

    // The edited contact must still exist, untouched by revert.
    const editedContact = (await db.collection('contacts').doc(editedContactId).get()).data() as Contact
    expect(editedContact.phone).toBe('4015559999')

    // The untouched contact must be gone.
    const untouchedSnap = await db
      .collection('contacts')
      .where('email', '==', 'untouched-created@example.com')
      .get()
    expect(untouchedSnap.empty).toBe(true)

    const batchDoc = (await db.collection('importBatches').doc(commit.importBatchId).get()).data() as ImportBatch
    expect(batchDoc.status).toBe('partially_reverted')
  })

  it('partial revert: an updated-then-edited-since-import contact is skipped and NEVER hard-deleted', async () => {
    await seedContact('preexisting-updated', {
      firstName: 'Pre',
      lastName: 'Existing',
      email: 'pre-existing@example.com',
      status: 'New Lead',
    })

    const commit = await runCommitImport({
      fileName: 'partial-updated.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'Pre', lastName: 'Existing', email: 'pre-existing@example.com', status: 'Active' }],
    })
    expect(commit.updatedCount).toBe(1)

    // Simulate an edit made to the contact after the import committed. As
    // above, a real edit path always sets `updatedAt` explicitly.
    await db
      .collection('contacts')
      .doc('preexisting-updated')
      .update({ status: 'Past Customer', updatedAt: Timestamp.now() })

    const result = await runRevert({ importBatchId: commit.importBatchId })

    expect(result.status).toBe('partially_reverted')
    expect(result.revertedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.skippedContactIds).toEqual(['preexisting-updated'])

    // The contact must still exist (never hard-deleted for an `updated`
    // row) and must keep the post-import edit, not the reverted value.
    const contact = (await db.collection('contacts').doc('preexisting-updated').get()).data() as Contact
    expect(contact.status).toBe('Past Customer')
  })

  it('restores previousValues on an untouched updated contact', async () => {
    await seedContact('untouched-updated', {
      firstName: 'Untouched',
      lastName: 'Updated',
      email: 'untouched-updated@example.com',
      status: 'New Lead',
    })

    const commit = await runCommitImport({
      fileName: 'restore.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [
        {
          firstName: 'Untouched',
          lastName: 'Updated',
          email: 'untouched-updated@example.com',
          status: 'Active',
          phone: '4015550100',
        },
      ],
    })
    expect(commit.updatedCount).toBe(1)

    const afterImport = (await db.collection('contacts').doc('untouched-updated').get()).data() as Contact
    expect(afterImport.status).toBe('Active')
    expect(afterImport.phone).toBe('4015550100')

    const result = await runRevert({ importBatchId: commit.importBatchId })
    expect(result.status).toBe('reverted')
    expect(result.revertedCount).toBe(1)

    const restored = (await db.collection('contacts').doc('untouched-updated').get()).data() as Contact
    expect(restored.status).toBe('New Lead')
    expect(restored.phone).toBeUndefined() // was absent before the import
  })

  it('rejects reverting a batch that is not committed (double-revert rejection)', async () => {
    const commit = await runCommitImport({
      fileName: 'double-revert.csv',
      defaultOwnerId: DEFAULT_OWNER_ID,
      rows: [{ firstName: 'Only', lastName: 'Row', email: 'only-row@example.com' }],
    })

    const first = await runRevert({ importBatchId: commit.importBatchId })
    expect(first.status).toBe('reverted')

    await expect(runRevert({ importBatchId: commit.importBatchId })).rejects.toMatchObject({
      code: 'failed-precondition',
    })
  })
})
