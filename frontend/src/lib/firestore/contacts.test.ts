/**
 * Unit tests for `contacts.ts`'s write helpers, with `firebase/firestore`
 * mocked out entirely (no emulator, no rendering) — these prove the exact
 * Firestore payload shape this file sends, which is where the two
 * invariants that matter most for this task actually live:
 *   1. `searchTokens`/`nameLower` must never be sent — that's Task 4's
 *      trigger's job.
 *   2. A contact create must always set `mergedInto`/`duplicateReviewStatus`/
 *      `possibleDuplicateOf` explicitly to `null` (see `firestore.rules`'
 *      `duplicateFieldsUnchanged()` comment — omitting any of them
 *      permanently blocks the owning rep from ever updating the contact
 *      again).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addDocMock = vi.fn()
const updateDocMock = vi.fn()
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}))

vi.mock('../firebase', () => ({ db: {} }))

import { createContact, logContact, updateContact } from './contacts'

beforeEach(() => {
  vi.clearAllMocks()
  addDocMock.mockResolvedValue({ id: 'contact-new-1' })
  updateDocMock.mockResolvedValue(undefined)
})

describe('createContact', () => {
  it('requires only firstName/lastName, trims them, and sets the dedup-invariant fields to null', async () => {
    const id = await createContact({
      firstName: '  Jane ',
      lastName: ' Doe',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })

    expect(id).toBe('contact-new-1')
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>

    expect(payload).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      organizationId: null,
      ownerId: 'rep-1',
      source: 'manual',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      duplicateReviewStatus: null,
      possibleDuplicateOf: null,
      createdBy: 'rep-1',
      importBatchId: null,
    })
  })

  it('never sends searchTokens/nameLower — those are the server trigger\'s job', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('searchTokens')
    expect(payload).not.toHaveProperty('nameLower')
  })

  it('omits optional fields entirely when not supplied, rather than writing undefined', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: null,
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('phone')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('lastContactDate')
    expect(payload).not.toHaveProperty('lastContactMode')
    expect(payload).not.toHaveProperty('organizationName')
  })

  it('includes organizationName only when an organization is actually set', async () => {
    await createContact({
      firstName: 'A',
      lastName: 'B',
      organizationId: 'org-1',
      organizationName: 'Acme Corp',
      ownerId: 'rep-1',
      createdBy: 'rep-1',
    })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.organizationName).toBe('Acme Corp')
    expect(payload.organizationId).toBe('org-1')
  })
})

describe('updateContact', () => {
  it('never touches searchTokens/nameLower/ownerId/duplicate fields unless explicitly asked', async () => {
    await updateContact('contact-1', { firstName: 'New' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.firstName).toBe('New')
    for (const field of [
      'searchTokens',
      'nameLower',
      'ownerId',
      'mergedInto',
      'duplicateReviewStatus',
      'possibleDuplicateOf',
    ]) {
      expect(payload).not.toHaveProperty(field)
    }
  })

  it('only includes ownerId when a reassignment is explicitly requested (admin flow)', async () => {
    await updateContact('contact-1', { ownerId: 'new-owner' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.ownerId).toBe('new-owner')
  })
})

describe('logContact', () => {
  it('sets lastContactDate/lastContactMode', async () => {
    await logContact('contact-1', 'Phone', new Date('2026-01-01T00:00:00Z'))
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.lastContactMode).toBe('Phone')
    expect(payload.lastContactDate).toBeDefined()
  })
})
