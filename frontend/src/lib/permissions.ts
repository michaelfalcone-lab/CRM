import type { User } from 'shared'

/**
 * UI-only convenience mirror of `firestore.rules`' `ownsRecord()` +
 * `isAdmin()`: an admin can edit anything, a rep can edit only records they
 * own. This is NOT the enforcement — Firestore rules are — it only decides
 * whether to show an edit affordance at all, so a rep is never offered a
 * button the rules would reject.
 */
export function canEditRecord(
  user: User | null,
  record: { ownerId: string } | null | undefined,
): boolean {
  if (!user || !record) return false
  return user.role === 'admin' || record.ownerId === user.authUid
}
