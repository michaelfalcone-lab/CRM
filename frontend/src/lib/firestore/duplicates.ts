/**
 * Data access for the Duplicates worklist (Task 10): the contacts
 * `commitImport`'s Tier-3 (exact case-insensitive full-name-only) matcher
 * flagged as a possible duplicate during CSV import — see
 * `functions/src/lib/identityMatching.ts` for why Tier 3 is never
 * auto-merged, and `functions/src/callable/commitImport.ts` for where
 * `duplicateReviewStatus: 'flagged'`/`possibleDuplicateOf` actually get set.
 *
 * Every active user may READ this list (`firestore.rules`' `contacts`
 * collection has no ownership-based read gate — `allow read: if
 * isActiveUser()`), but the two resolving actions below are admin-only:
 * `duplicateFieldsUnchanged()` in `firestore.rules` blocks a non-admin
 * owner from touching `mergedInto`/`duplicateReviewStatus`/
 * `possibleDuplicateOf` even on a contact they own, so both writes here
 * only ever succeed for an admin caller. `DuplicatesPage` mirrors that by
 * not rendering these actions for a non-admin at all (never rendered-and-
 * disabled), the same pattern `ResultStep`'s admin-only undo uses.
 */
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import type { Contact } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface UseFlaggedDuplicatesResult {
  duplicates: WithId<Contact>[]
  loading: boolean
  error: string | null
}

/**
 * Live list of contacts with `duplicateReviewStatus === 'flagged'`, newest
 * first. Uses the existing `duplicateReviewStatus ASC, createdAt DESC`
 * composite index (`firestore.indexes.json`) — no schema/index work
 * needed for this task.
 */
export function useFlaggedDuplicates(): UseFlaggedDuplicatesResult {
  const [duplicates, setDuplicates] = useState<WithId<Contact>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const q = query(
      collection(db, 'contacts'),
      where('duplicateReviewStatus', '==', 'flagged'),
      orderBy('createdAt', 'desc'),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setDuplicates(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Contact) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [])

  return { duplicates, loading, error }
}

/**
 * "Not a duplicate": clears a flagged contact's duplicate-review state —
 * an admin decided this contact is genuinely distinct from
 * `possibleDuplicateOf`. Admin-only per `firestore.rules`.
 */
export async function markNotDuplicate(contactId: string): Promise<void> {
  await updateDoc(doc(db, 'contacts', contactId), {
    duplicateReviewStatus: 'resolved',
    possibleDuplicateOf: null,
    updatedAt: serverTimestamp(),
  })
}

/**
 * "Confirm duplicate": merges `losingId` into `winningId` by setting
 * `mergedInto` — from this point on, every list/search view that filters
 * on `mergedInto` (Task 10's global search, `useContacts`) excludes the
 * losing record. Admin-only per `firestore.rules`.
 *
 * Does NOT migrate the losing record's opportunities or notes onto the
 * winner — a known, documented Phase 1 limitation (see `DuplicatesPage`'s
 * confirm-action copy, which surfaces this to the admin before they click).
 */
export async function confirmDuplicateMerge(losingId: string, winningId: string): Promise<void> {
  await updateDoc(doc(db, 'contacts', losingId), {
    mergedInto: winningId,
    duplicateReviewStatus: 'resolved',
    updatedAt: serverTimestamp(),
  })
}
