/**
 * Callable, admin-only: undoes a committed CSV import batch.
 *
 * Admin-only is a reasonable default not explicitly stated in the approved
 * design for this specific action — gated the same way every other
 * bulk/destructive-adjacent callable in this codebase is (`requireActiveAdmin`,
 * see `lib/config.ts`), since undoing an import can hard-delete contacts.
 *
 * Reads `importBatches/{id}/rows` directly (never queries `contacts`), and
 * only proceeds while the batch's `status` is still `'committed'` — a
 * second revert attempt fails with `failed-precondition` rather than
 * double-applying (or re-deleting already-deleted) changes.
 *
 * For each row, "untouched since import" is decided by an *exact* equality
 * check between the contact's current `updatedAt` and the row's own
 * `writtenAt` (never `importBatches.committedAt` — see the comment in
 * `commitImport.ts` on why `writtenAt` has to be the literal same
 * `Timestamp` value written to the contact, not a second independently
 * resolved one). A row whose contact was edited after import is skipped and
 * recorded rather than reverted.
 *
 *  - `action === 'created'` rows: hard-delete the contact (only if
 *    untouched).
 *  - `action === 'updated'` rows: restore `previousValues` onto the
 *    existing contact (only if untouched) — the pre-existing contact is
 *    never deleted.
 *
 * Never deletes any `organizations` docs created during the original
 * import.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { Contact, ImportBatch, ImportBatchRow } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { requireActiveAdmin } from '../lib/config'
import { toUpdatePayload } from '../lib/importContactFields'
import { BatchWriter } from '../lib/batchWriter'

export interface RevertImportBatchData {
  importBatchId: string
}

export interface RevertImportBatchResult {
  status: 'reverted' | 'partially_reverted'
  revertedCount: number
  skippedCount: number
  skippedContactIds: string[]
}

function isEqualTimestamp(a: Timestamp | undefined, b: Timestamp | undefined): boolean {
  if (!a || !b) return false
  return a.isEqual(b)
}

export const revertImportBatch = onCall<RevertImportBatchData>(async (request) => {
  await requireActiveAdmin(request.auth)

  const importBatchId = request.data?.importBatchId
  if (typeof importBatchId !== 'string' || importBatchId.trim() === '') {
    throw new HttpsError('invalid-argument', 'importBatchId is required.')
  }

  const batchRef = db.collection('importBatches').doc(importBatchId)
  const batchSnap = await batchRef.get()
  if (!batchSnap.exists) {
    throw new HttpsError('not-found', 'No import batch found for that id.')
  }
  const batchData = batchSnap.data() as ImportBatch
  if (batchData.status !== 'committed') {
    throw new HttpsError(
      'failed-precondition',
      `This batch cannot be reverted (status is '${batchData.status}').`,
    )
  }

  const rowsSnap = await batchRef.collection('rows').get()

  const writer = new BatchWriter()
  let revertedCount = 0
  const skippedContactIds: string[] = []

  for (const rowDoc of rowsSnap.docs) {
    const row = rowDoc.data() as ImportBatchRow
    const contactId = rowDoc.id
    const contactRef = db.collection('contacts').doc(contactId)
    const contactSnap = await contactRef.get()

    if (!contactSnap.exists) {
      // Already gone (e.g. a previous partial revert, or deleted through
      // some other path) — nothing to undo, and it wasn't "edited since
      // import," so it isn't counted as skipped either.
      continue
    }

    const contact = contactSnap.data() as Contact
    if (!isEqualTimestamp(contact.updatedAt, row.writtenAt)) {
      skippedContactIds.push(contactId)
      continue
    }

    if (row.action === 'created') {
      await writer.delete(contactRef)
    } else {
      await writer.update(contactRef, toUpdatePayload(row.previousValues))
    }
    revertedCount += 1
  }

  const status: RevertImportBatchResult['status'] =
    skippedContactIds.length === 0 ? 'reverted' : 'partially_reverted'
  const revertSummary = {
    revertedCount,
    skippedCount: skippedContactIds.length,
    skippedContactIds,
  }

  await writer.update(batchRef, {
    status,
    revertedAt: FieldValue.serverTimestamp(),
    revertSummary,
  })
  await writer.commit()

  return {
    status,
    revertedCount,
    skippedCount: skippedContactIds.length,
    skippedContactIds,
  } satisfies RevertImportBatchResult
})
