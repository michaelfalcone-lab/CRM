/**
 * Firestore `onWrite` trigger on `contacts/{contactId}`. Two jobs:
 *
 *  1. Create/update — keep `nameLower` and `searchTokens` correct so global
 *     search always has up-to-date fields to query, even for edits made
 *     outside `commitImport` (which sets these itself at creation time —
 *     see `lib/searchTokens.ts`).
 *
 *  2. Delete — cascade. The Contacts list lets any active user delete a
 *     contact, but the client can only remove the `contacts/{id}` doc
 *     itself (it has no permission to touch another rep's activities). This
 *     trigger finishes the job with the Admin SDK: it removes that
 *     contact's `activities`, `opportunities`, and `notes` so the record
 *     leaves the dashboard cleanly and nothing is orphaned.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import type { Contact } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { computeContactSearchTokens, computeNameLower } from '../lib/searchTokens'

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((token, index) => token === sortedB[index])
}

/**
 * Deletes everything keyed to a now-deleted contact: top-level
 * `activities` and `opportunities` docs with `contactId == id`, plus the
 * `contacts/{id}/notes` subcollection (still reachable by path even though
 * the parent doc is gone). `BulkWriter` batches the deletes and retries
 * transient failures; `recursiveDelete` handles the subcollection.
 */
async function cascadeDeleteContactChildren(contactId: string): Promise<void> {
  const writer = db.bulkWriter()
  for (const collectionName of ['activities', 'opportunities'] as const) {
    const snap = await db.collection(collectionName).where('contactId', '==', contactId).get()
    for (const docSnap of snap.docs) {
      void writer.delete(docSnap.ref)
    }
  }
  await writer.close()

  await db.recursiveDelete(db.collection('contacts').doc(contactId))
}

export const onContactWrite = onDocumentWritten('contacts/{contactId}', async (event) => {
  const change = event.data
  if (!change) return

  const after = change.after
  if (!after.exists) {
    await cascadeDeleteContactChildren(event.params.contactId)
    return
  }

  const afterData = after.data() as Contact
  const before = change.before
  const beforeData = before.exists ? (before.data() as Contact) : undefined

  // Merging is out of scope for this task beyond not breaking on it: skip
  // recomputation for a record that was already merged/excluded before
  // this write and remains merged after it.
  if (beforeData?.mergedInto != null && afterData.mergedInto != null) {
    return
  }

  const nameLower = computeNameLower(afterData.firstName ?? '', afterData.lastName ?? '')
  const searchTokens = computeContactSearchTokens({
    firstName: afterData.firstName ?? '',
    lastName: afterData.lastName ?? '',
    email: afterData.email,
    phone: afterData.phone,
    organizationName: afterData.organizationName,
  })

  const alreadyCorrect =
    afterData.nameLower === nameLower &&
    Array.isArray(afterData.searchTokens) &&
    sameTokens(afterData.searchTokens, searchTokens)

  // Only write when something actually changed — writing unconditionally
  // would re-trigger this same function forever.
  if (alreadyCorrect) return

  await after.ref.update({ nameLower, searchTokens })
})
