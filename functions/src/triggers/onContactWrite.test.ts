/**
 * Unit tests for `onContactWrite`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions`. The trigger is exercised directly via
 * `CloudFunction.run(event)` (the same testing escape hatch used for
 * callables — see `lib/testSupport.ts`), with real `DocumentSnapshot`s read
 * back from the emulator rather than hand-built ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/firebaseAdmin'
import { firestoreWriteEvent } from '../lib/testSupport'
import { onContactWrite } from './onContactWrite'

async function snapshotFor(id: string) {
  return db.collection('contacts').doc(id).get()
}

describe('onContactWrite', () => {
  beforeEach(async () => {
    for (const name of ['contacts', 'activities', 'opportunities']) {
      const existing = await db.collection(name).listDocuments()
      await Promise.all(existing.map((ref) => ref.delete()))
    }
  })

  it('computes nameLower and searchTokens on create, including org-name words', async () => {
    const id = 'contact-create'
    const ref = db.collection('contacts').doc(id)
    const before = await snapshotFor(id)

    await ref.set({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada.Lovelace@Example.com',
      phone: '(401) 555-0100',
      organizationName: 'Brown Athletics Boosters',
      ownerId: 'owner-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      searchTokens: [],
      nameLower: '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
      importBatchId: null,
    })
    const after = await snapshotFor(id)

    await onContactWrite.run(
      firestoreWriteEvent('contacts/{contactId}', { contactId: id }, before, after),
    )

    const updated = (await snapshotFor(id)).data()!
    expect(updated.nameLower).toBe('ada lovelace')
    expect(updated.searchTokens).toEqual(
      expect.arrayContaining([
        'ada',
        'lovelace',
        'ada lovelace',
        'ada.lovelace@example.com',
        'ada.lovelace',
        '4015550100',
        'brown',
        'athletics',
        'boosters',
      ]),
    )
  })

  it('does not write again once nameLower/searchTokens are already correct', async () => {
    const id = 'contact-stable'
    const ref = db.collection('contacts').doc(id)
    const before = await snapshotFor(id)
    await ref.set({
      firstName: 'Grace',
      lastName: 'Hopper',
      ownerId: 'owner-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      searchTokens: [],
      nameLower: '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
      importBatchId: null,
    })
    const firstAfter = await snapshotFor(id)
    await onContactWrite.run(
      firestoreWriteEvent('contacts/{contactId}', { contactId: id }, before, firstAfter),
    )

    const stableSnap = await snapshotFor(id)
    const updateSpy = vi.spyOn(stableSnap.ref, 'update')

    await onContactWrite.run(
      firestoreWriteEvent('contacts/{contactId}', { contactId: id }, stableSnap, stableSnap),
    )

    expect(updateSpy).not.toHaveBeenCalled()
    updateSpy.mockRestore()
  })

  it('skips recomputation when mergedInto is set on both before and after', async () => {
    const id = 'contact-merged'
    const ref = db.collection('contacts').doc(id)
    const mergedData = {
      firstName: 'Old',
      lastName: 'Name',
      ownerId: 'owner-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: 'some-other-contact',
      duplicateReviewStatus: 'resolved',
      possibleDuplicateOf: null,
      // Deliberately wrong, so we can prove the trigger left it alone.
      searchTokens: ['stale-token'],
      nameLower: 'stale value',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
      importBatchId: null,
    }
    await ref.set(mergedData)
    const before = await snapshotFor(id)
    // Simulate an unrelated field touch while merged (still merged after).
    await ref.update({ phone: '4015551234' })
    const after = await snapshotFor(id)

    await onContactWrite.run(
      firestoreWriteEvent('contacts/{contactId}', { contactId: id }, before, after),
    )

    const result = (await snapshotFor(id)).data()!
    expect(result.nameLower).toBe('stale value')
    expect(result.searchTokens).toEqual(['stale-token'])
  })

  it('on delete, cascade-removes the contact’s activities, opportunities, and notes — and nothing else', async () => {
    const id = 'casc-contact'
    const ref = db.collection('contacts').doc(id)
    await ref.set({
      firstName: 'Casey',
      lastName: 'Cascade',
      ownerId: 'owner-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      searchTokens: [],
      nameLower: 'cascade casey',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
      importBatchId: null,
    })
    await db.collection('activities').doc('casc-act-1').set({ contactId: id, type: 'Email', ownerId: 'owner-1', occurredAt: Timestamp.now() })
    await db.collection('activities').doc('casc-act-2').set({ contactId: id, type: 'Inbound Call', ownerId: 'owner-2', occurredAt: Timestamp.now() })
    await db.collection('activities').doc('casc-act-other').set({ contactId: 'a-different-contact', type: 'Email', ownerId: 'owner-1', occurredAt: Timestamp.now() })
    await db.collection('opportunities').doc('casc-opp-1').set({ contactId: id, sport: 'Football', stage: 'created', ownerId: 'owner-1', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), createdBy: 'owner-1' })
    await ref.collection('notes').doc('casc-note-1').set({ text: 'a note', authorId: 'owner-1', authorName: 'Owner One', createdAt: Timestamp.now() })

    const before = await snapshotFor(id)
    await ref.delete()
    const after = await snapshotFor(id)

    await onContactWrite.run(
      firestoreWriteEvent('contacts/{contactId}', { contactId: id }, before, after),
    )

    expect((await db.collection('activities').doc('casc-act-1').get()).exists).toBe(false)
    expect((await db.collection('activities').doc('casc-act-2').get()).exists).toBe(false)
    expect((await db.collection('opportunities').doc('casc-opp-1').get()).exists).toBe(false)
    expect((await ref.collection('notes').doc('casc-note-1').get()).exists).toBe(false)
    // Another contact's activity is untouched.
    expect((await db.collection('activities').doc('casc-act-other').get()).exists).toBe(true)

    await db.collection('activities').doc('casc-act-other').delete()
  })
})
