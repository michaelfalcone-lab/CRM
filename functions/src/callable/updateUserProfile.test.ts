/**
 * Unit tests for `updateUserProfile`, run against the Firestore Local
 * Emulator Suite via `npm run test:functions`. Never touches a real
 * Firebase project.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Role, User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { updateUserProfile } from './updateUserProfile'

const ADMIN_UID = 'admin-uid-profile'
const ADMIN_EMAIL = 'admin-profile@brown.edu'
const REP_UID = 'rep-uid-profile'
const REP_EMAIL = 'rep-profile@brown.edu'
const TARGET_EMAIL = 'target-profile@brown.edu'

async function seedUser(emailLower: string, overrides: Partial<User>) {
  await db
    .collection('users')
    .doc(emailLower)
    .set({
      email: emailLower,
      displayName: 'Original Name',
      photoURL: '',
      position: 'Original Position',
      role: 'rep',
      active: true,
      authUid: null,
      createdAt: new Date(),
      createdBy: 'seed-script',
      ...overrides,
    })
}

describe('updateUserProfile', () => {
  beforeAll(async () => {
    await seedUser(ADMIN_EMAIL, { role: 'admin', authUid: ADMIN_UID })
    await seedUser(REP_EMAIL, { role: 'rep', authUid: REP_UID })
    await seedUser(TARGET_EMAIL, {})
  })

  it('rejects a non-admin caller', async () => {
    await expect(
      updateUserProfile.run(
        callableRequest(
          { email: TARGET_EMAIL, displayName: 'Hijacked' },
          fakeAuth(REP_UID, REP_EMAIL),
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' })

    const snap = await db.collection('users').doc(TARGET_EMAIL).get()
    expect((snap.data() as User).displayName).toBe('Original Name')
  })

  it('rejects an invalid role value', async () => {
    await expect(
      updateUserProfile.run(
        // Deliberately invalid role, cast past the `Role` union to exercise
        // the callable's own runtime validation.
        callableRequest(
          { email: TARGET_EMAIL, role: 'superadmin' as unknown as Role },
          fakeAuth(ADMIN_UID, ADMIN_EMAIL),
        ),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('lets an admin update role/position/displayName', async () => {
    const result = (await updateUserProfile.run(
      callableRequest(
        { email: TARGET_EMAIL, role: 'admin', position: 'New Position', displayName: 'New Name' },
        fakeAuth(ADMIN_UID, ADMIN_EMAIL),
      ),
    )) as User

    expect(result.role).toBe('admin')
    expect(result.position).toBe('New Position')
    expect(result.displayName).toBe('New Name')

    const snap = await db.collection('users').doc(TARGET_EMAIL).get()
    const data = snap.data() as User
    expect(data.role).toBe('admin')
    expect(data.position).toBe('New Position')
    expect(data.displayName).toBe('New Name')
  })
})
