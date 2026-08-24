/**
 * Owner-picker support. `firestore.rules` lets a non-admin `get` only their
 * own `users/{email}` doc (never `list`/`read` the collection), while an
 * admin can read the whole collection — see the rules' `match /users`
 * block. That means a rep's client can only ever resolve their own
 * `ownerId` to a display name; another rep's `ownerId` is structurally
 * unresolvable from a non-admin session. This file (and every place that
 * renders an "owner" column) works within that constraint rather than
 * attempting a read the rules would reject:
 *   - `useOwnerDirectory` returns the full active-user list for an admin
 *     (used for the admin-only "reassign owner" picker), or just the
 *     caller's own entry for a rep.
 *   - `useOwnerLabel` (in `lib/ownerLabel.ts`) is what list/detail views
 *     actually call to render one `ownerId` — falling back to a neutral
 *     placeholder when it can't be resolved.
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
  /** `false` for a rep — the directory is necessarily incomplete for them,
   * so callers can decide whether to show a picker at all. */
  isComplete: boolean
  loading: boolean
}

/**
 * `currentUser` must be the caller's own linked `User` doc (from
 * `useCurrentUser()`), used both to decide whether a full-collection read
 * is even allowed and, for a rep, as the one entry the returned directory
 * can contain.
 */
export function useOwnerDirectory(currentUser: User | null): UseOwnerDirectoryResult {
  const isAdmin = currentUser?.role === 'admin'
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(isAdmin)

  useEffect(() => {
    if (!isAdmin) {
      setOwners(
        currentUser?.authUid
          ? [{ authUid: currentUser.authUid, displayName: currentUser.displayName }]
          : [],
      )
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
  }, [isAdmin, currentUser?.authUid, currentUser?.displayName])

  return { owners, isComplete: isAdmin, loading }
}
