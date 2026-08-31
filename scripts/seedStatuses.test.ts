/**
 * Unit tests for `seedStatuses`, run against the Firestore Local Emulator
 * Suite via `npm run test:functions` (same shared-emulator setup as
 * `seedPipelineStages.test.ts` / `bootstrapFirstAdmin.test.ts`). Drives
 * the exported function directly against the shared emulator `db` — no
 * subprocess, no real network call.
 *
 * `statuses` is a shared, uncleared collection across this suite; this
 * file clears it in `beforeEach` so the "refuse if any target id already
 * exists" guard is tested against a known starting state.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../functions/src/lib/firebaseAdmin'
import { WORKFLOW_STATUSES, seedStatuses } from './seedStatuses'

async function clearStatuses() {
  const snap = await db.collection('statuses').get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
}

describe('seedStatuses', () => {
  beforeEach(async () => {
    await clearStatuses()
  })

  it('writes exactly the 5 workflow statuses when the collection is empty', async () => {
    const result = await seedStatuses(db)
    expect(result).toEqual({ status: 'created', ids: WORKFLOW_STATUSES.map((s) => s.id) })

    const snap = await db.collection('statuses').get()
    expect(snap.docs.map((d) => d.id).sort()).toEqual(
      ['new-lead', 'active', 'warm', 'win', 'lost'].sort(),
    )
  })

  it('sets label, order, color, and active: true on every status', async () => {
    await seedStatuses(db)
    for (const status of WORKFLOW_STATUSES) {
      const data = (await db.collection('statuses').doc(status.id).get()).data()!
      expect(data.label).toBe(status.label)
      expect(data.order).toBe(status.order)
      expect(data.color).toBe(status.color)
      expect(data.active).toBe(true)
    }
  })

  it('writes no isWon/isLost flags — Status carries no such fields', async () => {
    await seedStatuses(db)
    for (const status of WORKFLOW_STATUSES) {
      const data = (await db.collection('statuses').doc(status.id).get()).data()!
      expect(data.isWon).toBeUndefined()
      expect(data.isLost).toBeUndefined()
    }
  })

  it('uses only colors from the badgeColor.ts BadgeColor set', () => {
    const valid = new Set(['primary', 'secondary', 'success', 'warning', 'info', 'danger', 'neutral'])
    for (const status of WORKFLOW_STATUSES) {
      expect(valid.has(status.color)).toBe(true)
    }
  })

  it('stays in sync with the demo seeder — "Lost" not "Dead"', () => {
    // The dead -> lost rename touched several files; this pins that the
    // production seed and the demo seed agree on the id and label.
    const lost = WORKFLOW_STATUSES.find((s) => s.id === 'lost')
    expect(lost?.label).toBe('Lost')
    expect(WORKFLOW_STATUSES.some((s) => s.id === 'dead')).toBe(false)
  })

  it('refuses to overwrite existing statuses docs without --force', async () => {
    await db.collection('statuses').doc('warm').set({
      label: 'Hand-Edited Warm',
      order: 99,
      active: true,
      color: 'warning',
    })

    const result = await seedStatuses(db)
    expect(result).toEqual({ status: 'refused', existingIds: ['warm'] })

    // A refusal writes nothing: the hand-edited doc is untouched and no
    // other status doc was created.
    const warmSnap = await db.collection('statuses').doc('warm').get()
    expect(warmSnap.data()!.label).toBe('Hand-Edited Warm')
    expect((await db.collection('statuses').doc('new-lead').get()).exists).toBe(false)
  })

  it('overwrites existing docs when force is true', async () => {
    await db.collection('statuses').doc('warm').set({
      label: 'Hand-Edited Warm',
      order: 99,
      active: true,
      color: 'warning',
    })

    const result = await seedStatuses(db, { force: true })
    expect(result.status).toBe('created')

    const warmSnap = await db.collection('statuses').doc('warm').get()
    expect(warmSnap.data()!.label).toBe('Warm')
    expect(warmSnap.data()!.order).toBe(3)
  })

  it('reports every conflicting id when more than one already exists', async () => {
    await db.collection('statuses').doc('win').set({ label: 'x', order: 1, active: true, color: 'success' })
    await db.collection('statuses').doc('lost').set({ label: 'y', order: 1, active: true, color: 'danger' })

    const result = await seedStatuses(db)
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.existingIds.sort()).toEqual(['lost', 'win'])
    }
  })
})
