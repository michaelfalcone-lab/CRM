/**
 * Unit tests for `linkAccount`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions`. Never touches a real Firebase
 * project.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { User } from 'shared'
import { db } from '../lib/firebaseAdmin'
import { callableRequest, fakeAuth } from '../lib/testSupport'
import { NOT_INVITED_REASON, linkAccount } from './linkAccount'

const GHOST_UID = 'ghost-uid-link'
const GHOST_EMAIL = 'ghost-link@brown.edu' // no users doc at all

const INACTIVE_UID = 'inactive-uid-link'
const INACTIVE_EMAIL = 'inactive-link@brown.edu'

const FIRST_LINK_EMAIL = 'first-link@brown.edu'
const FIRST_LINK_UID = 'first-link-uid'

const RELINK_EMAIL = 'relink@brown.edu'
const RELINK_OLD_UID = 'relink-old-uid'
const RELINK_NEW_UID = 'relink-new-uid'

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

describe('linkAccount', () => {
  beforeAll(async () => {
    await seedUser(INACTIVE_EMAIL, { active: false, authUid: null })
    await seedUser(FIRST_LINK_EMAIL, { active: true, authUid: null })
    await seedUser(RELINK_EMAIL, { active: true, authUid: RELINK_OLD_UID })
  })

  it('rejects with a "not-invited" reason when no users doc exists', async () => {
    await expect(
      linkAccount.run(callableRequest({}, fakeAuth(GHOST_UID, GHOST_EMAIL))),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      details: { reason: NOT_INVITED_REASON },
    })
  })

  it('rejects with a "not-invited" reason when the users doc is inactive', async () => {
    await expect(
      linkAccount.run(callableRequest({}, fakeAuth(INACTIVE_UID, INACTIVE_EMAIL))),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      details: { reason: NOT_INVITED_REASON },
    })
  })

  it('links a first-time sign-in: sets authUid and linkedAt, returns the user doc', async () => {
    const result = (await linkAccount.run(
      callableRequest({}, fakeAuth(FIRST_LINK_UID, FIRST_LINK_EMAIL)),
    )) as User

    expect(result.authUid).toBe(FIRST_LINK_UID)
    expect(result.linkedAt).toBeTruthy()

    const snap = await db.collection('users').doc(FIRST_LINK_EMAIL).get()
    const data = snap.data() as User
    expect(data.authUid).toBe(FIRST_LINK_UID)
    expect(data.linkedAt).toBeTruthy()
  })

  it('re-links to a new uid when authUid is already set to a different uid', async () => {
    const result = (await linkAccount.run(
      callableRequest({}, fakeAuth(RELINK_NEW_UID, RELINK_EMAIL)),
    )) as User

    expect(result.authUid).toBe(RELINK_NEW_UID)

    const snap = await db.collection('users').doc(RELINK_EMAIL).get()
    const data = snap.data() as User
    expect(data.authUid).toBe(RELINK_NEW_UID)
    expect(data.authUid).not.toBe(RELINK_OLD_UID)
  })
})
