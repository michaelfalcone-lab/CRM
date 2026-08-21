/**
 * Unit tests for `onOrganizationWrite` — same testing pattern as
 * `onContactWrite.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/firebaseAdmin'
import { firestoreWriteEvent } from '../lib/testSupport'
import { onOrganizationWrite } from './onOrganizationWrite'

async function snapshotFor(id: string) {
  return db.collection('organizations').doc(id).get()
}

describe('onOrganizationWrite', () => {
  beforeEach(async () => {
    const existing = await db.collection('organizations').listDocuments()
    await Promise.all(existing.map((ref) => ref.delete()))
  })

  it('computes nameLower and searchTokens on create', async () => {
    const id = 'org-create'
    const ref = db.collection('organizations').doc(id)
    const before = await snapshotFor(id)

    await ref.set({
      name: 'Brown Athletics Boosters',
      type: '',
      phone: '',
      address: '',
      ownerId: 'owner-1',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      searchTokens: [],
      nameLower: '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
    })
    const after = await snapshotFor(id)

    await onOrganizationWrite.run(
      firestoreWriteEvent('organizations/{orgId}', { orgId: id }, before, after),
    )

    const updated = (await snapshotFor(id)).data()!
    expect(updated.nameLower).toBe('brown athletics boosters')
    expect(updated.searchTokens).toEqual(
      expect.arrayContaining(['brown', 'athletics', 'boosters', 'brown athletics boosters']),
    )
  })

  it('does not write again once already correct', async () => {
    const id = 'org-stable'
    const ref = db.collection('organizations').doc(id)
    const before = await snapshotFor(id)
    await ref.set({
      name: 'Acme Corp',
      type: '',
      phone: '',
      address: '',
      ownerId: 'owner-1',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      searchTokens: [],
      nameLower: '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
    })
    const firstAfter = await snapshotFor(id)
    await onOrganizationWrite.run(
      firestoreWriteEvent('organizations/{orgId}', { orgId: id }, before, firstAfter),
    )

    const stableSnap = await snapshotFor(id)
    const updateSpy = vi.spyOn(stableSnap.ref, 'update')

    await onOrganizationWrite.run(
      firestoreWriteEvent('organizations/{orgId}', { orgId: id }, stableSnap, stableSnap),
    )

    expect(updateSpy).not.toHaveBeenCalled()
    updateSpy.mockRestore()
  })

  it('skips recomputation when mergedInto is set on both before and after', async () => {
    const id = 'org-merged'
    const ref = db.collection('organizations').doc(id)
    await ref.set({
      name: 'Old Name',
      type: '',
      phone: '',
      address: '',
      ownerId: 'owner-1',
      externalIds: { paciolanCustomerId: null },
      mergedInto: 'some-other-org',
      searchTokens: ['stale-token'],
      nameLower: 'stale value',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'owner-1',
    })
    const before = await snapshotFor(id)
    await ref.update({ phone: '4015551234' })
    const after = await snapshotFor(id)

    await onOrganizationWrite.run(
      firestoreWriteEvent('organizations/{orgId}', { orgId: id }, before, after),
    )

    const result = (await snapshotFor(id)).data()!
    expect(result.nameLower).toBe('stale value')
    expect(result.searchTokens).toEqual(['stale-token'])
  })
})
