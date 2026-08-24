/**
 * Callable invoked by any signed-in user immediately after Google sign-in,
 * to link their Firebase Auth uid to the `users/{emailLower}` doc an admin
 * created for them via `inviteUser`. See the approved design's §4.2-4.3.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { NOT_INVITED_REASON } from 'shared'
import type { User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { toEmailLower } from '../lib/config'

/**
 * Callable error codes are restricted to the fixed `FunctionsErrorCode`
 * enum (see firebase-functions), which has no "not-invited" value. The
 * client-distinguishable reason therefore lives in `details.reason` — the
 * frontend should check `error.details?.reason === NOT_INVITED_REASON`
 * rather than parsing the human-readable message. The constant itself
 * lives in `shared` (not duplicated here) so `/frontend` and `/functions`
 * can't drift apart on the literal; re-exported so existing imports of
 * `NOT_INVITED_REASON` from this module keep working.
 */
export { NOT_INVITED_REASON }

function notInvitedError(): HttpsError {
  return new HttpsError('permission-denied', 'No active invitation was found for this email.', {
    reason: NOT_INVITED_REASON,
  })
}

export const linkAccount = onCall(async (request) => {
  const auth = request.auth
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
  const ref = db.collection('users').doc(emailLower)
  const snap = await ref.get()

  if (!snap.exists) {
    throw notInvitedError()
  }
  const userDoc = snap.data() as User
  if (userDoc.active !== true) {
    throw notInvitedError()
  }

  if (userDoc.authUid === auth.uid) {
    // Already linked to this exact uid — idempotent no-op, no write needed.
    return userDoc
  }

  // Either the first link (authUid was null) or a re-link on a new uid
  // (per §4.3, email is the trust anchor, so the incoming uid always wins
  // over whatever authUid was previously stored).
  await ref.update({ authUid: auth.uid, linkedAt: FieldValue.serverTimestamp() })
  const updated = await ref.get()
  return updated.data()
})
