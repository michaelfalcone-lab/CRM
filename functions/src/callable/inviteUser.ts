/**
 * Admin-only callable: invites a user by creating their `users/{emailLower}`
 * doc ahead of their first sign-in. See the approved design's §4.1.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebaseAdmin'
import { WORKSPACE_DOMAIN, requireActiveAdmin, toEmailLower } from '../lib/config'

export interface InviteUserData {
  email: string
  displayName?: string
  position?: string
  role?: 'admin' | 'rep'
}

export const inviteUser = onCall<InviteUserData>(async (request) => {
  const admin = await requireActiveAdmin(request.auth)

  const rawEmail = request.data?.email
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    throw new HttpsError('invalid-argument', 'email is required.')
  }
  const emailLower = toEmailLower(rawEmail)
  if (!emailLower.endsWith(`@${WORKSPACE_DOMAIN}`)) {
    throw new HttpsError('invalid-argument', `email must be a @${WORKSPACE_DOMAIN} address.`)
  }

  const ref = db.collection('users').doc(emailLower)
  const existing = await ref.get()
  if (existing.exists) {
    throw new HttpsError('already-exists', 'A user with this email has already been invited.')
  }

  const role = request.data?.role === 'admin' ? 'admin' : 'rep'

  // Per firestore.rules' documented invariant, `authUid` must always be set
  // explicitly at `users` doc creation, even to null (an omitted field
  // would otherwise permanently block later admin-only writes that depend
  // on comparing it).
  await ref.set({
    email: emailLower,
    displayName: request.data?.displayName ?? '',
    photoURL: '',
    position: request.data?.position ?? '',
    role,
    active: true,
    authUid: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: admin.uid,
  })

  return { emailLower }
})
