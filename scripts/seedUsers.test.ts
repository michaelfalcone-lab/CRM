/**
 * Unit tests for `seedUsers`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions` (same shared-emulator setup as
 * `seedStatuses.test.ts`). `users` is a shared, uncleared collection
 * across this suite (also written by `bootstrapFirstAdmin.test.ts` and the
 * callable suites) — this file clears it in `beforeEach` so the per-doc
 * skip behaviour is tested against a known starting state.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../functions/src/lib/firebaseAdmin'
import { TEAM_USERS, seedUsers } from './seedUsers'

async function clearUsers() {
  const snap = await db.collection('users').get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
}

describe('seedUsers', () => {
  beforeEach(async () => {
    await clearUsers()
  })

  it('creates every team user, keyed by lowercased email, when the collection is empty', async () => {
    const result = await seedUsers(db)
    expect(result.skipped).toEqual([])
    expect(result.created.sort()).toEqual(TEAM_USERS.map((u) => u.email.toLowerCase()).sort())

    const snap = await db.collection('users').get()
    expect(snap.docs.map((d) => d.id).sort()).toEqual(
      TEAM_USERS.map((u) => u.email.toLowerCase()).sort(),
    )
  })

  it('writes the exact field shape inviteUser writes', async () => {
    await seedUsers(db)
    const rep = (await db.collection('users').doc('michael_woodley@brown.edu').get()).data()!
    expect(rep.email).toBe('michael_woodley@brown.edu')
    expect(rep.displayName).toBe('Michael Woodley')
    expect(rep.role).toBe('rep')
    expect(rep.active).toBe(true)
    expect(rep.authUid).toBeNull()
    expect(rep.photoURL).toBe('')
    expect(rep.position).toBe('')
    expect(rep.createdBy).toBe('seed-script')
    expect(rep.createdAt).toBeDefined()
  })

  it('assigns admin vs rep roles as configured', async () => {
    await seedUsers(db)
    const admin = (await db.collection('users').doc('kimberly_dieroff@brown.edu').get()).data()!
    expect(admin.role).toBe('admin')
    const rep = (await db.collection('users').doc('jordan_sullivan@brown.edu').get()).data()!
    expect(rep.role).toBe('rep')
  })

  it('skips existing users and reports them, without overwriting', async () => {
    // Simulate the real state: the bootstrapped admin already there, plus
    // one of the team already invited (and since linked).
    await db.collection('users').doc('kimberly_dieroff@brown.edu').set({
      email: 'kimberly_dieroff@brown.edu',
      displayName: 'Kim Dieroff',
      photoURL: '',
      position: 'Director',
      role: 'admin',
      active: true,
      authUid: 'already-linked-uid',
      createdAt: new Date(),
      createdBy: 'someone-else',
    })

    const result = await seedUsers(db)
    expect(result.skipped).toEqual(['kimberly_dieroff@brown.edu'])
    expect(result.created.sort()).toEqual(
      TEAM_USERS.filter((u) => u.email !== 'kimberly_dieroff@brown.edu')
        .map((u) => u.email.toLowerCase())
        .sort(),
    )

    // Untouched: still has its linked uid and hand-set position.
    const kim = (await db.collection('users').doc('kimberly_dieroff@brown.edu').get()).data()!
    expect(kim.authUid).toBe('already-linked-uid')
    expect(kim.position).toBe('Director')
  })

  it('overwrites existing users when force is true', async () => {
    await db.collection('users').doc('kimberly_dieroff@brown.edu').set({
      email: 'kimberly_dieroff@brown.edu',
      displayName: 'Stale Name',
      photoURL: '',
      position: '',
      role: 'rep',
      active: false,
      authUid: 'old-uid',
      createdAt: new Date(),
      createdBy: 'x',
    })

    const result = await seedUsers(db, { force: true })
    expect(result.skipped).toEqual([])
    expect(result.created).toContain('kimberly_dieroff@brown.edu')

    const kim = (await db.collection('users').doc('kimberly_dieroff@brown.edu').get()).data()!
    expect(kim.displayName).toBe('Kim Dieroff')
    expect(kim.role).toBe('admin')
    expect(kim.active).toBe(true)
    expect(kim.authUid).toBeNull()
  })

  it('every seeded email is @brown.edu', () => {
    for (const u of TEAM_USERS) {
      expect(u.email.toLowerCase().endsWith('@brown.edu')).toBe(true)
    }
  })

  it('does not include the bootstrapped first admin', () => {
    expect(TEAM_USERS.some((u) => u.email.toLowerCase() === 'michael_falcone@brown.edu')).toBe(false)
  })
})
