/**
 * Unit tests for `bootstrapFirstAdmin`, run against the Firestore Local
 * Emulator Suite via `npm run test:functions` (see root package.json,
 * which wraps this through `scripts/with-java.sh npx firebase
 * emulators:exec` and points `vitest run` at both `functions/src` and
 * `scripts`). Drives the exported function directly against the shared
 * emulator `db`, the same way `functions/src/callable/*.test.ts` drive
 * callables via `.run()` — no subprocess, no real network call.
 *
 * This is a *shared*, uncleared `users` collection across every test
 * file in the suite (see root `vitest.config.ts`'s comment on
 * `fileParallelism: false`): other suites (inviteUser, linkAccount, etc.)
 * seed their own `users/{email}` docs and never clear the collection.
 * The "refuse if any users doc exists" guard is therefore tested by
 * explicitly clearing the `users` collection first in this file's
 * `beforeEach`, rather than assuming it starts empty.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../functions/src/lib/firebaseAdmin.ts'
import { bootstrapFirstAdmin, toEmailLower, WORKSPACE_DOMAIN } from './bootstrapFirstAdmin.ts'

async function clearUsers() {
  const snap = await db.collection('users').get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
}

describe('bootstrapFirstAdmin', () => {
  beforeEach(async () => {
    await clearUsers()
  })

  it('rejects an empty email', async () => {
    const result = await bootstrapFirstAdmin(db, '')
    expect(result).toEqual({ status: 'invalid-email' })

    const snap = await db.collection('users').get()
    expect(snap.empty).toBe(true)
  })

  it(`rejects an email outside @${WORKSPACE_DOMAIN}`, async () => {
    const result = await bootstrapFirstAdmin(db, 'someone@gmail.com')
    expect(result).toEqual({ status: 'invalid-email' })

    const snap = await db.collection('users').get()
    expect(snap.empty).toBe(true)
  })

  it('creates the first admin user doc when the users collection is empty', async () => {
    const email = 'first-admin@brown.edu'
    const result = await bootstrapFirstAdmin(db, email, 'First Admin')

    expect(result).toEqual({ status: 'created', emailLower: toEmailLower(email) })

    const snap = await db.collection('users').doc(toEmailLower(email)).get()
    expect(snap.exists).toBe(true)
    const data = snap.data()!
    expect(data.role).toBe('admin')
    expect(data.active).toBe(true)
    expect(data.authUid).toBeNull()
    expect(data.displayName).toBe('First Admin')
    expect(data.createdBy).toBe('bootstrap-script')
  })

  it('lowercases and trims the email', async () => {
    const result = await bootstrapFirstAdmin(db, '  Mixed-Case@Brown.EDU  ')
    expect(result).toEqual({ status: 'created', emailLower: 'mixed-case@brown.edu' })

    const snap = await db.collection('users').doc('mixed-case@brown.edu').get()
    expect(snap.exists).toBe(true)
  })

  it('refuses a second bootstrap once any users doc exists', async () => {
    const first = await bootstrapFirstAdmin(db, 'admin-one@brown.edu')
    expect(first.status).toBe('created')

    const second = await bootstrapFirstAdmin(db, 'admin-two@brown.edu')
    expect(second).toEqual({ status: 'already-bootstrapped' })

    // The second call must not have written anything.
    const secondSnap = await db.collection('users').doc('admin-two@brown.edu').get()
    expect(secondSnap.exists).toBe(false)

    // Exactly the first admin's doc should exist.
    const all = await db.collection('users').get()
    expect(all.docs.map((d) => d.id)).toEqual(['admin-one@brown.edu'])
  })

  it('refuses to run even when the existing users doc is unrelated (e.g. seeded by another test file)', async () => {
    await db.collection('users').doc('someone-else@brown.edu').set({
      email: 'someone-else@brown.edu',
      displayName: 'Someone Else',
      photoURL: '',
      position: '',
      role: 'rep',
      active: true,
      authUid: 'some-uid',
      createdAt: new Date(),
      createdBy: 'seed-script',
    })

    const result = await bootstrapFirstAdmin(db, 'would-be-admin@brown.edu')
    expect(result).toEqual({ status: 'already-bootstrapped' })

    const snap = await db.collection('users').doc('would-be-admin@brown.edu').get()
    expect(snap.exists).toBe(false)
  })
})
