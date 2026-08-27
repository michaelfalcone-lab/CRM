/**
 * Owner-directory support. `firestore.rules`' `match /users` block grants
 * `allow read: if isActiveUser()` — Task 8 deliberately widened this
 * beyond admin-only so every active team member can resolve every rep's
 * display name (e.g. the sales-output dashboard's per-rep rows need BOTH
 * reps' names, not just the viewer's own). `allow write` stays
 * admin-only — user docs themselves are still admin-managed.
 *
 * `useOwnerDirectory` used to gate the full-collection query on
 * `currentUser?.role === 'admin'` client-side, which was stricter than
 * the rules actually required: a rep's client got back only their own
 * entry (`isComplete: false`), so any UI resolving *another* rep's
 * `ownerId` (this dashboard's per-rep rows, viewed by a rep) silently
 * rendered a placeholder for the other rep while an admin viewing the
 * same page saw both real names — a gap that only ever showed up in a
 * rep's session, never an admin-only spot check. Fixed: the query now
 * runs for any active current user, admin or rep alike.
 *
 * Widening WHO MAY READ this directory must never be confused with
 * widening WHO MAY REASSIGN an `ownerId` — those are separate questions.
 * The "reassign owner" picker (`ContactFormView`/`OrganizationFormView`)
 * stays admin-only via its own `isAdmin` check gating whether that
 * `<Select>` renders at all; it does not consult `isComplete` and this
 * change doesn't touch it. `firestore.rules`' `ownerUnchanged()`/create
 * checks are the actual enforcement boundary either way, same as every
 * other permission gate in this app — this hook (and `isComplete`) is
 * only ever a display-layer signal, never a security boundary.
 *
 *   - `useOwnerDirectory` returns the full active-user list for any
 *     active current user.
 *   - `useOwnerLabel` (in `lib/ownerLabel.ts`) is what list/detail views
 *     actually call to render one `ownerId` — falling back to a neutral
 *     placeholder when it still can't be resolved (e.g. a deactivated
 *     account no longer in the directory at all).
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { User } from 'shared'
import { db } from '../firebase'

export interface OwnerOption {
  authUid: string
  displayName: string
}

export interface UseOwnerDirectoryResult {
  owners: OwnerOption[]
  /** `true` whenever the full active-user directory was actually fetched
   * (any active current user, admin or rep) — `false` only when there's
   * no active current user to query on behalf of yet (e.g. mid sign-in),
   * in which case `owners` is empty. No longer role-dependent: every
   * active user's directory read is complete, per the widened
   * `firestore.rules` (see this file's header comment). */
  isComplete: boolean
  loading: boolean
}

/**
 * `currentUser` must be the caller's own linked `User` doc (from
 * `useCurrentUser()`) — used only to gate whether the query runs at all
 * (an active `currentUser` implies `isActiveUser()` under the rules,
 * since `linkAccount` refuses to link an inactive account; see
 * `functions/src/callable/linkAccount.ts`). The returned directory is the
 * same full active-user list regardless of `currentUser.role`.
 */
export function useOwnerDirectory(currentUser: User | null): UseOwnerDirectoryResult {
  const hasActiveUser = !!currentUser
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(hasActiveUser)

  useEffect(() => {
    if (!hasActiveUser) {
      setOwners([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(
      collection(db, 'users'),
      where('active', '==', true),
      orderBy('displayName'),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setOwners(
          snapshot.docs
            .map((d) => d.data() as User)
            .filter((u): u is User & { authUid: string } => !!u.authUid)
            .map((u) => ({ authUid: u.authUid, displayName: u.displayName })),
        )
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsubscribe
  }, [hasActiveUser])

  return { owners, isComplete: hasActiveUser, loading }
}
