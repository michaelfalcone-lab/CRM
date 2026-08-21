/**
 * Unit tests for `inviteUser`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions` (see root package.json, which wraps
 * this through `scripts/with-java.sh npx firebase emulators:exec`). Never
 * touches a real Firebase project.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { inviteUser } from './inviteUser'

const ADMIN_UID = 'admin-uid-invite'
const ADMIN_EMAIL = 'admin-invite@brown.edu'
const REP_UID = 'rep-uid-invite'
const REP_EMAIL = 'rep-invite@brown.edu'

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

describe('inviteUser', () => {
  beforeAll(async () => {
    await seedUser(ADMIN_EMAIL, { role: 'admin', authUid: ADMIN_UID })
    await seedUser(REP_EMAIL, { role: 'rep', authUid: REP_UID })
  })

  it('rejects a non-admin caller', async () => {
    await expect(
      inviteUser.run(
        callableRequest({ email: 'invite-1@brown.edu' }, fakeAuth(REP_UID, REP_EMAIL)),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' })

    const snap = await db.collection('users').doc('invite-1@brown.edu').get()
    expect(snap.exists).toBe(false)
  })

  it('rejects an email outside the configured Workspace domain', async () => {
    await expect(
      inviteUser.run(
        callableRequest({ email: 'someone@gmail.com' }, fakeAuth(ADMIN_UID, ADMIN_EMAIL)),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('creates a new invited user with active true and authUid explicitly null', async () => {
    const email = 'invite-2@brown.edu'

    await inviteUser.run(callableRequest({ email }, fakeAuth(ADMIN_UID, ADMIN_EMAIL)))

    const snap = await db.collection('users').doc(email).get()
    expect(snap.exists).toBe(true)
    const data = snap.data() as User
    expect(data.active).toBe(true)
    expect(data.authUid).toBeNull()
    expect(data.createdBy).toBe(ADMIN_UID)
    expect(data.role).toBe('rep')
  })

  it('rejects a duplicate invite for an email that already has a users doc', async () => {
    const email = 'invite-3@brown.edu'
    await inviteUser.run(callableRequest({ email }, fakeAuth(ADMIN_UID, ADMIN_EMAIL)))

    await expect(
      inviteUser.run(callableRequest({ email }, fakeAuth(ADMIN_UID, ADMIN_EMAIL))),
    ).rejects.toMatchObject({ code: 'already-exists' })
  })
})
