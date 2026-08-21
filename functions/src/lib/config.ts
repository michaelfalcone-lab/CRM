/**
 * Shared configuration and the admin/active-user check helpers used by
 * every callable in Task 3 (and, per the task brief, intended for reuse by
 * later tasks — Task 4's commitImport, in particular, needs an equivalent
 * "is this caller an active user" check).
 *
 * Placement note: `WORKSPACE_DOMAIN` and the check helpers live together in
 * this one file (rather than splitting the helpers into their own module)
 * because they're small, single-purpose, and every admin-only callable
 * imports both together.
 */
import type { CallableRequest } from 'firebase-functions/v2/https'
import { HttpsError } from 'firebase-functions/v2/https'
import type { User } from 'shared'
import { db } from './firebaseAdmin'

// `AuthData` (the type of `CallableRequest.auth`) isn't itself part of
// firebase-functions' public `v2/https` export surface (it's used to type
// `CallableRequest.auth` but not re-exported by name), so it's derived
// structurally here instead of imported directly.
export type CallerAuth = NonNullable<CallableRequest['auth']>

/** The only Google Workspace domain allowed to be invited / sign in. */
export const WORKSPACE_DOMAIN = 'brown.edu'

export function toEmailLower(email: string): string {
  return email.trim().toLowerCase()
}

export interface CallerIdentity {
  uid: string
  emailLower: string
  userDoc: User
}

/**
 * Re-derives firestore.rules' `isSignedIn()` + `isActiveUser()` checks
 * server-side. The Admin SDK bypasses Firestore security rules entirely,
 * so this is the *only* enforcement, for every callable that uses it, of
 * "caller is signed in with a verified email and is an active, linked
 * user." This is not a character-for-character port of the rules
 * language — it's the equivalent check expressed in TypeScript against
 * Admin SDK reads:
 *
 *   isSignedIn()   -> request.auth present, auth.token.email_verified == true
 *   isActiveUser() -> a users/{emailLower} doc exists, active == true, and
 *                      its authUid matches the caller's uid (so a caller
 *                      can't act as a user record they haven't linked)
 */
export async function requireActiveUser(auth: CallerAuth | undefined): Promise<CallerIdentity> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
  if (auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'A verified email is required.')
  }
  const email = auth.token.email
  if (!email) {
    throw new HttpsError('failed-precondition', 'Auth token has no email claim.')
  }

  const emailLower = toEmailLower(email)
  const snap = await db.collection('users').doc(emailLower).get()
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Caller is not a provisioned user.')
  }

  const userDoc = snap.data() as User
  if (userDoc.active !== true || userDoc.authUid !== auth.uid) {
    throw new HttpsError('permission-denied', 'Caller is not an active, linked user.')
  }

  return { uid: auth.uid, emailLower, userDoc }
}

/**
 * Mirrors firestore.rules' `isAdmin()`: an active, linked user whose
 * `role` is `'admin'`. Used by every admin-only callable in this task.
 */
export async function requireActiveAdmin(auth: CallerAuth | undefined): Promise<CallerIdentity> {
  const caller = await requireActiveUser(auth)
  if (caller.userDoc.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin privileges required.')
  }
  return caller
}
