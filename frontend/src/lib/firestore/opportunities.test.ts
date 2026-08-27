/**
 * Unit tests for `updateOpportunity`'s `wonAt`/`lostAt` maintenance — the
 * dashboard's "won this month"/"lost this month" queries are only correct
 * if these fields are stamped exactly on the transition into a won/lost
 * stage and never touched again, per `shared`'s `Opportunity` doc comment.
 *
 * `firebase/firestore` is mocked entirely (no emulator). `runTransaction`
 * is mocked to synchronously call the passed updater against a
 * caller-configured "server" document (`currentOpportunity`), the same way
 * the real Firestore SDK would call it against the actual server-side
 * current state — this is what lets these tests prove `updateOpportunity`
 * reads the *current* stage fresh rather than trusting anything the caller
 * passed in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, OpportunityStage } from 'shared'
import type { WithId } from '../firestoreTypes'

let currentOpportunity: Opportunity

const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))
const txGetMock = vi.fn(
  async (): Promise<{ exists: () => boolean; data: () => Opportunity | undefined }> => ({
    exists: () => true,
    data: () => currentOpportunity,
  }),
)
const txUpdateMock = vi.fn()
const runTransactionMock = vi.fn(async (_db: unknown, updater: (tx: unknown) => Promise<void>) => {
  const tx = { get: txGetMock, update: txUpdateMock }
  await updater(tx)
})

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  doc: (...args: unknown[]) => docMock(...args),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
  runTransaction: (...args: [unknown, (tx: unknown) => Promise<void>]) => runTransactionMock(...args),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  where: vi.fn(),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { updateOpportunity } from './opportunities'

function stage(
  id: string,
  overrides: Partial<OpportunityStage> = {},
): WithId<OpportunityStage> {
  return {
    id,
    label: id,
    order: 0,
    active: true,
    color: 'neutral',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    ...overrides,
  }
}

const STAGES: WithId<OpportunityStage>[] = [
  stage('created'),
  stage('in-conversation'),
  stage('verbal-commit'),
  stage('lost', { isLost: true }),
  stage('won', { isWon: true }),
]

function baseOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    contactId: 'contact-1',
    organizationId: null,
    sport: 'Football',
    stage: 'created',
    ownerId: 'rep-1',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  currentOpportunity = baseOpportunity()
})

describe('updateOpportunity — wonAt/lostAt transitions', () => {
  it('stamps wonAt on transitioning into the Won stage', async () => {
    currentOpportunity = baseOpportunity({ stage: 'verbal-commit' })
    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.stage).toBe('won')
    expect(patch.wonAt).toBeDefined()
    expect(patch.lostAt).toBeUndefined()
  })

  it('stamps lostAt on transitioning into the Lost stage', async () => {
    currentOpportunity = baseOpportunity({ stage: 'in-conversation' })
    await updateOpportunity('opp-1', { stage: 'lost' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.stage).toBe('lost')
    expect(patch.lostAt).toBeDefined()
    expect(patch.wonAt).toBeUndefined()
  })

  it('does NOT overwrite an existing wonAt on a later, unrelated edit (note change) while still Won', async () => {
    const originalWonAt = { seconds: 1000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: originalWonAt })

    await updateOpportunity('opp-1', { note: 'Adding a note in March' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.note).toBe('Adding a note in March')
    // wonAt must be completely untouched — not re-stamped, not deleted.
    expect(patch).not.toHaveProperty('wonAt')
  })

  it('does NOT overwrite an existing wonAt when the same Won stage is re-submitted', async () => {
    const originalWonAt = { seconds: 1000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: originalWonAt })

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('wonAt')
  })

  it('defensively refuses to overwrite wonAt even if reached again via a fresh Won transition somehow already carrying wonAt', async () => {
    // Anomalous data: current stage is not flagged Won but wonAt is
    // already set (e.g. hand-edited data). The guard must still hold.
    const originalWonAt = { seconds: 1000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'created', wonAt: originalWonAt })

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('wonAt')
  })

  it('clears lostAt (deleteField) when reopened from Lost back to an open stage', async () => {
    const originalLostAt = { seconds: 2000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'lost', lostAt: originalLostAt, lostReason: 'Cost' })

    await updateOpportunity('opp-1', { stage: 'in-conversation' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.stage).toBe('in-conversation')
    expect(patch.lostAt).toEqual({ __deleteField: true })
    // Reopening also clears the now-stale lost reason.
    expect(patch.lostReason).toEqual({ __deleteField: true })
  })

  it('clears wonAt (deleteField) when moved out of Won back to an open stage', async () => {
    const originalWonAt = { seconds: 1000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: originalWonAt })

    await updateOpportunity('opp-1', { stage: 'verbal-commit' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.wonAt).toEqual({ __deleteField: true })
  })

  it('an explicit lostReason on the same patch wins over the auto-clear when reopening', async () => {
    currentOpportunity = baseOpportunity({ stage: 'lost', lostAt: { seconds: 2000, nanoseconds: 0 } })

    await updateOpportunity(
      'opp-1',
      { stage: 'in-conversation', lostReason: 'Still relevant context' },
      STAGES,
    )

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.lostReason).toBe('Still relevant context')
  })

  it('never touches wonAt/lostAt when the patch does not change stage at all', async () => {
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: { seconds: 1000, nanoseconds: 0 } })

    await updateOpportunity('opp-1', { sport: "Men's Basketball" }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('stage')
    expect(patch).not.toHaveProperty('wonAt')
    expect(patch).not.toHaveProperty('lostAt')
  })

  it('treats a retired stage missing from the caller-supplied stages list as neither won nor lost', async () => {
    // current.stage ('retired-stage') isn't in STAGES at all.
    currentOpportunity = baseOpportunity({ stage: 'retired-stage' })

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.wonAt).toBeDefined()
  })

  it('reads the current stage from the transaction, not from any client-cached value', async () => {
    // Even though nothing in the patch mentions the contact's real current
    // stage, the transition must be computed from what tx.get() returns.
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: { seconds: 1000, nanoseconds: 0 } })
    await updateOpportunity('opp-1', { stage: 'lost' }, STAGES)

    expect(txGetMock).toHaveBeenCalledTimes(1)
    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    // Moving Won -> Lost: wonAt clears, lostAt stamps.
    expect(patch.wonAt).toEqual({ __deleteField: true })
    expect(patch.lostAt).toBeDefined()
  })

  it('throws if the opportunity does not exist', async () => {
    txGetMock.mockResolvedValueOnce({ exists: () => false, data: () => undefined })
    await expect(updateOpportunity('missing-opp', { stage: 'won' }, STAGES)).rejects.toThrow()
  })
})
