/**
 * Unit tests for `seedPipelineStages`, run against the Firestore Local
 * Emulator Suite via `npm run test:functions` (see root package.json and
 * `bootstrapFirstAdmin.test.ts`'s header comment for the shared-emulator
 * setup this suite runs under). Drives the exported function directly
 * against the shared emulator `db` — no subprocess, no real network call.
 *
 * `opportunityStages` is a *shared*, uncleared collection across this
 * suite (same caveat as `bootstrapFirstAdmin.test.ts`'s `users`
 * collection) — no other test file in `functions/src`/`scripts` currently
 * writes to it, but this file still clears it in `beforeEach` defensively,
 * for the same reason: the "refuse if any target id already exists" guard
 * must be tested against a known starting state, not an assumed-empty one.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../functions/src/lib/firebaseAdmin'
import { PIPELINE_STAGES, seedPipelineStages } from './seedPipelineStages'

async function clearStages() {
  const snap = await db.collection('opportunityStages').get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
}

describe('seedPipelineStages', () => {
  beforeEach(async () => {
    await clearStages()
  })

  it('writes exactly the 5 canonical stages when the collection is empty', async () => {
    const result = await seedPipelineStages(db)
    expect(result).toEqual({ status: 'created', ids: PIPELINE_STAGES.map((s) => s.id) })

    const snap = await db.collection('opportunityStages').get()
    expect(snap.docs.map((d) => d.id).sort()).toEqual(
      ['created', 'in-conversation', 'verbal-commit', 'lost', 'won'].sort(),
    )
  })

  it('sets isLost: true on Lost and isWon: true on Won, and neither flag on the 3 open stages', async () => {
    await seedPipelineStages(db)

    const lost = (await db.collection('opportunityStages').doc('lost').get()).data()!
    const won = (await db.collection('opportunityStages').doc('won').get()).data()!
    expect(lost.isLost).toBe(true)
    expect(lost.isWon).toBeUndefined()
    expect(won.isWon).toBe(true)
    expect(won.isLost).toBeUndefined()

    for (const id of ['created', 'in-conversation', 'verbal-commit']) {
      const data = (await db.collection('opportunityStages').doc(id).get()).data()!
      expect(data.isWon).toBeUndefined()
      expect(data.isLost).toBeUndefined()
    }
  })

  it('sets order and active: true on every stage', async () => {
    await seedPipelineStages(db)
    for (const stage of PIPELINE_STAGES) {
      const data = (await db.collection('opportunityStages').doc(stage.id).get()).data()!
      expect(data.order).toBe(stage.order)
      expect(data.active).toBe(true)
      expect(data.label).toBe(stage.label)
      expect(data.color).toBe(stage.color)
    }
  })

  it('uses only colors from the badgeColor.ts BadgeColor set', () => {
    const validColors = new Set(['primary', 'secondary', 'success', 'warning', 'info', 'danger', 'neutral'])
    for (const stage of PIPELINE_STAGES) {
      expect(validColors.has(stage.color)).toBe(true)
    }
  })

  it('refuses to overwrite existing opportunityStages docs without --force', async () => {
    await db.collection('opportunityStages').doc('won').set({
      label: 'Hand-Edited Won',
      order: 99,
      active: true,
      color: 'success',
      isWon: true,
    })

    const result = await seedPipelineStages(db)
    expect(result).toEqual({ status: 'refused', existingIds: ['won'] })

    // The hand-edited doc must be untouched, and no other stage doc
    // should have been written either — a refusal writes nothing at all.
    const wonSnap = await db.collection('opportunityStages').doc('won').get()
    expect(wonSnap.data()!.label).toBe('Hand-Edited Won')
    const createdSnap = await db.collection('opportunityStages').doc('created').get()
    expect(createdSnap.exists).toBe(false)
  })

  it('overwrites existing docs when force is true', async () => {
    await db.collection('opportunityStages').doc('won').set({
      label: 'Hand-Edited Won',
      order: 99,
      active: true,
      color: 'success',
      isWon: true,
    })

    const result = await seedPipelineStages(db, { force: true })
    expect(result.status).toBe('created')

    const wonSnap = await db.collection('opportunityStages').doc('won').get()
    expect(wonSnap.data()!.label).toBe('Won')
    expect(wonSnap.data()!.order).toBe(5)
  })

  it('reports every conflicting id when more than one already exists', async () => {
    await db.collection('opportunityStages').doc('won').set({ label: 'x', order: 1, active: true, color: 'success' })
    await db.collection('opportunityStages').doc('lost').set({ label: 'y', order: 1, active: true, color: 'danger' })

    const result = await seedPipelineStages(db)
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.existingIds.sort()).toEqual(['lost', 'won'])
    }
  })
})
