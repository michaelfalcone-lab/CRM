/**
 * Admin-only callable: updates `role`/`position`/`displayName` on a
 * `users/{emailLower}` doc.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { Role } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { requireActiveAdmin, toEmailLower } from '../lib/config'

export interface UpdateUserProfileData {
  email: string
  role?: Role
  position?: string
  displayName?: string
}

const VALID_ROLES: Role[] = ['admin', 'rep']

export const updateUserProfile = onCall<UpdateUserProfileData>(async (request) => {
  await requireActiveAdmin(request.auth)

  const rawEmail = request.data?.email
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    throw new HttpsError('invalid-argument', 'email is required.')
  }

  const updates: Partial<Record<'role' | 'position' | 'displayName', unknown>> = {}

  if (request.data?.role !== undefined) {
    if (!VALID_ROLES.includes(request.data.role)) {
      throw new HttpsError('invalid-argument', `role must be one of: ${VALID_ROLES.join(', ')}.`)
    }
    updates.role = request.data.role
  }
  if (request.data?.position !== undefined) {
    if (typeof request.data.position !== 'string') {
      throw new HttpsError('invalid-argument', 'position must be a string.')
    }
    updates.position = request.data.position
  }
  if (request.data?.displayName !== undefined) {
    if (typeof request.data.displayName !== 'string') {
      throw new HttpsError('invalid-argument', 'displayName must be a string.')
    }
    updates.displayName = request.data.displayName
  }
  if (Object.keys(updates).length === 0) {
    throw new HttpsError('invalid-argument', 'No fields to update.')
  }

  const ref = db.collection('users').doc(toEmailLower(rawEmail))
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No user found for that email.')
  }

  await ref.update(updates)
  const updated = await ref.get()
  return updated.data()
})
