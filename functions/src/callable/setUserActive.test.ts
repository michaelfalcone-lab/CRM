/**
 * Unit tests for `setUserActive`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions`. Never touches a real Firebase
 * project.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { setUserActive } from './setUserActive'

const ADMIN_UID = 'admin-uid-active'
const ADMIN_EMAIL = 'admin-active@brown.edu'
const REP_UID = 'rep-uid-active'
const REP_EMAIL = 'rep-active@brown.edu'
const TARGET_EMAIL = 'target-active@brown.edu'

async function seedUser(emailLower: string, overrides: Partial<User>) {
  await db
    .collection('users')
    .doc(emailLower)
    .set({
      email: emailLower,
      displayName: 'Seed',
      photoURL: '',
      position: '',
      role: 'rep',
      active: true,
      authUid: null,
      createdAt: new Date(),
      createdBy: 'seed-script',
      ...overrides,
    })
}

describe('setUserActive', () => {
  beforeAll(async () => {
    await seedUser(ADMIN_EMAIL, { role: 'admin', authUid: ADMIN_UID })
    await seedUser(REP_EMAIL, { role: 'rep', authUid: REP_UID })
    await seedUser(TARGET_EMAIL, { active: true })
  })

  it('rejects a non-admin caller', async () => {
    await expect(
      setUserActive.run(
        callableRequest(
          { email: TARGET_EMAIL, active: false },
          fakeAuth(REP_UID, REP_EMAIL),
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' })

    const snap = await db.collection('users').doc(TARGET_EMAIL).get()
    expect((snap.data() as User).active).toBe(true)
  })

  it('lets an admin toggle active off and back on', async () => {
    await setUserActive.run(
      callableRequest({ email: TARGET_EMAIL, active: false }, fakeAuth(ADMIN_UID, ADMIN_EMAIL)),
    )
    let snap = await db.collection('users').doc(TARGET_EMAIL).get()
    expect((snap.data() as User).active).toBe(false)

    await setUserActive.run(
      callableRequest({ email: TARGET_EMAIL, active: true }, fakeAuth(ADMIN_UID, ADMIN_EMAIL)),
    )
    snap = await db.collection('users').doc(TARGET_EMAIL).get()
    expect((snap.data() as User).active).toBe(true)
  })
})
