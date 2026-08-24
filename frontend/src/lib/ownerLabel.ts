import type { OwnerOption } from './firestore/users'

/**
 * Resolves one `ownerId` to a display string given an `OwnerOption[]`
 * directory (see `firestore/users.ts` for why that directory is complete
 * for an admin but only ever contains the caller's own entry for a rep).
 * Falls back to a neutral placeholder rather than a raw uid when the owner
 * can't be resolved from the caller's session.
 */
export function ownerLabel(
  ownerId: string,
  owners: OwnerOption[],
  currentUserUid: string | undefined,
): string {
  if (ownerId === currentUserUid) {
    const self = owners.find((o) => o.authUid === ownerId)
    return self ? self.displayName : 'You'
  }
  const match = owners.find((o) => o.authUid === ownerId)
  return match ? match.displayName : 'Other rep'
}
