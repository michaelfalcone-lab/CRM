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
/** `undefined` simulates the linked contact not existing (defensive case —
 * see the "contact was deleted" tests below); otherwise a `status` only,
 * since that's all this file's contact-sync logic reads. */
let currentContact: { status?: string } | undefined

const addDocMock = vi.fn(async (...args: unknown[]) => {
  void args
  return { id: 'new-opp-1' }
})
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))
/** Ref-aware: `doc(db, 'opportunities', id)` and `doc(db, 'contacts', id)`
 * both go through the same `tx.get`, so the fixture returned has to key
 * off which collection the ref actually points at (`ref.__doc[0]`, per
 * `docMock`'s own shape above) rather than assuming a fixed call order. */
const txGetMock = vi.fn(
  async (
    ref: { __doc: [string, string] },
  ): Promise<{ exists: () => boolean; data: () => unknown }> => {
    if (ref.__doc[0] === 'contacts') {
      return { exists: () => currentContact !== undefined, data: () => currentContact }
    }
    return { exists: () => true, data: () => currentOpportunity }
  },
)
const txUpdateMock = vi.fn()
const runTransactionMock = vi.fn(async (_db: unknown, updater: (tx: unknown) => Promise<void>) => {
  const tx = { get: txGetMock, update: txUpdateMock }
  await updater(tx)
})

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
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

import { createOpportunity, updateOpportunity } from './opportunities'

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
  currentContact = { status: 'warm' }
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

  it('writes year and productType only when the patch includes them', async () => {
    currentOpportunity = baseOpportunity()

    await updateOpportunity('opp-1', { year: '2027', productType: 'Mini Plans' }, STAGES)
    const withBoth = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(withBoth.year).toBe('2027')
    expect(withBoth.productType).toBe('Mini Plans')

    txUpdateMock.mockClear()
    await updateOpportunity('opp-1', { note: 'unrelated edit' }, STAGES)
    const noYear = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(noYear).not.toHaveProperty('year')
    expect(noYear).not.toHaveProperty('productType')
  })

  it('treats a retired stage missing from the caller-supplied stages list as neither won nor lost', async () => {
    // current.stage ('retired-stage') isn't in STAGES at all.
    currentOpportunity = baseOpportunity({ stage: 'retired-stage' })

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.wonAt).toBeDefined()
  })

  it('reads the current stage from the transaction, not from any client-cached value', async () => {
    // Even though nothing in the patch mentions the opportunity's real
    // current stage, the transition must be computed from what tx.get()
    // returns.
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: { seconds: 1000, nanoseconds: 0 } })
    await updateOpportunity('opp-1', { stage: 'lost' }, STAGES)

    // Two reads: the opportunity itself, plus the linked contact — this
    // transition newly stamps lostAt, which also evaluates the contact's
    // Win/Lost sync (see the "contact status sync" describe block below).
    expect(txGetMock).toHaveBeenCalledTimes(2)
    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    // Moving Won -> Lost: wonAt clears, lostAt stamps.
    expect(patch.wonAt).toEqual({ __deleteField: true })
    expect(patch.lostAt).toBeDefined()
  })

  it('throws if the opportunity does not exist', async () => {
    txGetMock.mockResolvedValueOnce({ exists: () => false, data: () => undefined })
    await expect(updateOpportunity('missing-opp', { stage: 'won' }, STAGES)).rejects.toThrow()
  })

  it('clears a stale wonAt when moved OUT of a retired (no-longer-in-the-list) Won stage', async () => {
    // The harmful direction of the retired-stage gap: the opportunity's
    // *current* stage ('retired-won-stage') isn't in the caller-supplied
    // STAGES list at all (e.g. an admin retired it after it was used), but
    // the doc still carries a real wonAt from when it was won. Moving it to
    // any open stage must still clear wonAt — keying off the document's own
    // field, not the unresolvable outgoing stage's flags, is what makes
    // this possible. See `updateOpportunity`'s doc comment.
    const originalWonAt = { seconds: 1000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({ stage: 'retired-won-stage', wonAt: originalWonAt })

    await updateOpportunity('opp-1', { stage: 'created' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.wonAt).toEqual({ __deleteField: true })
  })

  it('clears a stale lostAt when moved OUT of a retired (no-longer-in-the-list) Lost stage', async () => {
    const originalLostAt = { seconds: 2000, nanoseconds: 0 }
    currentOpportunity = baseOpportunity({
      stage: 'retired-lost-stage',
      lostAt: originalLostAt,
      lostReason: 'Cost',
    })

    await updateOpportunity('opp-1', { stage: 'in-conversation' }, STAGES)

    const patch = txUpdateMock.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.lostAt).toEqual({ __deleteField: true })
    expect(patch.lostReason).toEqual({ __deleteField: true })
  })
})

/** The linked contact's update, if one happened — asserts against
 * whichever `tx.update` call targeted the `contacts` ref (not necessarily
 * index 1, though it always is today since the opportunity update is
 * always first). Returns `undefined` if no contact update occurred. */
function contactUpdatePatch(): Record<string, unknown> | undefined {
  const call = txUpdateMock.mock.calls.find(
    (c) => (c[0] as { __doc: [string, string] }).__doc[0] === 'contacts',
  )
  return call?.[1] as Record<string, unknown> | undefined
}

describe('updateOpportunity — contact status sync (Win/Lost)', () => {
  it('sets the linked contact to win when the opportunity transitions into a Won stage', async () => {
    currentOpportunity = baseOpportunity({ stage: 'verbal-commit' })
    currentContact = { status: 'warm' }

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    expect(contactUpdatePatch()).toMatchObject({ status: 'win' })
  })

  it('sets the linked contact to lost when the opportunity transitions into a Lost stage', async () => {
    currentOpportunity = baseOpportunity({ stage: 'in-conversation' })
    currentContact = { status: 'active' }

    await updateOpportunity('opp-1', { stage: 'lost' }, STAGES)

    expect(contactUpdatePatch()).toMatchObject({ status: 'lost' })
  })

  it('does NOT demote an already-Win contact to Lost when a different opportunity for the same contact is lost', async () => {
    // The confirmed tie-break: a contact who converted on one sport keeps
    // that status even if a separate pitch for another sport falls through.
    currentOpportunity = baseOpportunity({ stage: 'in-conversation' })
    currentContact = { status: 'win' }

    await updateOpportunity('opp-1', { stage: 'lost' }, STAGES)

    expect(contactUpdatePatch()).toBeUndefined()
  })

  it('sets Win even over an existing Lost status from a different opportunity for the same contact', async () => {
    currentOpportunity = baseOpportunity({ stage: 'in-conversation' })
    currentContact = { status: 'lost' }

    await updateOpportunity('opp-1', { stage: 'won' }, STAGES)

    expect(contactUpdatePatch()).toMatchObject({ status: 'win' })
  })

  it('does not touch the contact at all when the stage change is not into Won or Lost', async () => {
    currentOpportunity = baseOpportunity({ stage: 'created' })

    await updateOpportunity('opp-1', { stage: 'in-conversation' }, STAGES)

    expect(contactUpdatePatch()).toBeUndefined()
  })

  it('does not touch the contact when re-saving an already-Won opportunity (no fresh transition)', async () => {
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: { seconds: 1000, nanoseconds: 0 } })

    await updateOpportunity('opp-1', { note: 'tweak' }, STAGES)

    expect(contactUpdatePatch()).toBeUndefined()
  })

  it('does not touch the contact when an opportunity is reopened out of Won/Lost back to an open stage', async () => {
    currentOpportunity = baseOpportunity({ stage: 'won', wonAt: { seconds: 1000, nanoseconds: 0 } })

    await updateOpportunity('opp-1', { stage: 'verbal-commit' }, STAGES)

    // Reopening clears wonAt on the OPPORTUNITY, but must not reach into
    // the contact at all — demoting a contact off Win/Lost is out of
    // scope; those are set only by a fresh transition into Won/Lost.
    expect(contactUpdatePatch()).toBeUndefined()
  })

  it('does not throw and does not update anything if the linked contact no longer exists', async () => {
    currentOpportunity = baseOpportunity({ stage: 'verbal-commit' })
    currentContact = undefined

    await expect(updateOpportunity('opp-1', { stage: 'won' }, STAGES)).resolves.toBeUndefined()
    expect(contactUpdatePatch()).toBeUndefined()
  })
})

describe('createOpportunity — wonAt/lostAt stamping at creation', () => {
  function createInput(stage: string): Parameters<typeof createOpportunity>[0] {
    return {
      contactId: 'contact-1',
      organizationId: null,
      sport: 'Football',
      year: '2026',
      productType: 'Season Tickets',
      stage,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    }
  }

  it('stamps wonAt (and not lostAt) when created directly into a Won stage', async () => {
    await createOpportunity(createInput('won'), STAGES)

    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.wonAt).toBeDefined()
    expect(payload.lostAt).toBeUndefined()
  })

  it('persists sport, year, and product type onto the new opportunity', async () => {
    await createOpportunity(createInput('created'), STAGES)

    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.sport).toBe('Football')
    expect(payload.year).toBe('2026')
    expect(payload.productType).toBe('Season Tickets')
  })

  it('stamps lostAt (and not wonAt) when created directly into a Lost stage', async () => {
    await createOpportunity(createInput('lost'), STAGES)

    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.lostAt).toBeDefined()
    expect(payload.wonAt).toBeUndefined()
  })

  it('stamps neither wonAt nor lostAt when created into an open stage', async () => {
    await createOpportunity(createInput('created'), STAGES)

    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.wonAt).toBeUndefined()
    expect(payload.lostAt).toBeUndefined()
  })
})
