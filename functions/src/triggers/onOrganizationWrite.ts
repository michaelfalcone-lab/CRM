/**
 * Firestore `onWrite` trigger on `organizations/{orgId}`: keeps `nameLower`
 * and `searchTokens` correct on every create/update. Same self-write-loop
 * guard as `onContactWrite.ts`.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import type { Organization } from 'shared'
import { computeOrgNameLower, computeOrgSearchTokens } from '../lib/searchTokens'

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((token, index) => token === sortedB[index])
}

export const onOrganizationWrite = onDocumentWritten('organizations/{orgId}', async (event) => {
  const change = event.data
  if (!change) return

  const after = change.after
  if (!after.exists) return // deleted — nothing to maintain

  const afterData = after.data() as Organization
  const before = change.before
  const beforeData = before.exists ? (before.data() as Organization) : undefined

  if (beforeData?.mergedInto != null && afterData.mergedInto != null) {
    return
  }

  const nameLower = computeOrgNameLower(afterData.name ?? '')
  const searchTokens = computeOrgSearchTokens(afterData.name ?? '')

  const alreadyCorrect =
    afterData.nameLower === nameLower &&
    Array.isArray(afterData.searchTokens) &&
    sameTokens(afterData.searchTokens, searchTokens)

  if (alreadyCorrect) return

  await after.ref.update({ nameLower, searchTokens })
})
