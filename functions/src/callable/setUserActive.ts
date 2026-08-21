/**
 * Admin-only callable: toggles `active` on a `users/{emailLower}` doc
 * (deactivating a user blocks `isActiveUser()` in firestore.rules, so this
 * is the sole way to revoke access short of deleting the doc).
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from '../lib/firebaseAdmin'
import { requireActiveAdmin, toEmailLower } from '../lib/config'

export interface SetUserActiveData {
  email: string
  active: boolean
}

export const setUserActive = onCall<SetUserActiveData>(async (request) => {
  await requireActiveAdmin(request.auth)

  const rawEmail = request.data?.email
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    throw new HttpsError('invalid-argument', 'email is required.')
  }
  if (typeof request.data?.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'active must be a boolean.')
  }

  const ref = db.collection('users').doc(toEmailLower(rawEmail))
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No user found for that email.')
  }

  await ref.update({ active: request.data.active })
  const updated = await ref.get()
  return updated.data()
})
