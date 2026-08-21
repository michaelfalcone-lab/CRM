/**
 * Firestore `onWrite` trigger on `contacts/{contactId}`: keeps `nameLower`
 * and `searchTokens` correct on every create/update, so Task 7's global
 * search always has up-to-date fields to query, even for edits made outside
 * `commitImport` (which sets these fields itself at creation time — see
 * `lib/searchTokens.ts`).
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import type { Contact } from 'shared'
import { computeContactSearchTokens, computeNameLower } from '../lib/searchTokens'

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((token, index) => token === sortedB[index])
}

export const onContactWrite = onDocumentWritten('contacts/{contactId}', async (event) => {
  const change = event.data
  if (!change) return

  const after = change.after
  if (!after.exists) return // deleted — nothing to maintain

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
