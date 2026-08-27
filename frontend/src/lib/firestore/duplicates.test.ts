/**
 * Unit tests for `duplicates.ts`, with `firebase/firestore` mocked out
 * entirely (no emulator) — same approach as `contacts.test.ts`/
 * `users.test.ts`. Covers:
 *   - `useFlaggedDuplicates`'s query shape (filters on
 *     `duplicateReviewStatus == 'flagged'`, uses the existing composite
 *     index's `createdAt desc` ordering).
 *   - `markNotDuplicate`'s exact payload (clears the flag).
 *   - `confirmDuplicateMerge`'s exact payload (sets `mergedInto`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Contact } from 'shared'

const updateDocMock = vi.fn()
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))
const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }))
const orderByMock = vi.fn((...args: unknown[]) => ({ __orderBy: args }))
type SnapshotCallback = ((snapshot: { docs: { id: string; data: () => unknown }[] }) => void) | undefined
type ErrorCallback = ((err: Error) => void) | undefined
let snapshotCallback: SnapshotCallback
const onSnapshotMock = vi.fn((_query: unknown, onNext: SnapshotCallback, _onError?: ErrorCallback) => {
  snapshotCallback = onNext
  return vi.fn() // unsubscribe
})

vi.mock('firebase/firestore', () => ({
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  onSnapshot: (...args: unknown[]) =>
    onSnapshotMock(...(args as [unknown, SnapshotCallback, ErrorCallback])),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  query: vi.fn((ref: unknown) => ref),
  where: (...args: unknown[]) => whereMock(...args),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { confirmDuplicateMerge, markNotDuplicate, useFlaggedDuplicates } from './duplicates'

function contactDoc(id: string, overrides: Partial<Contact> = {}): { id: string; data: () => Contact } {
  const data: Contact = {
    firstName: 'F',
    lastName: id,
    organizationId: null,
    ownerId: 'rep-1',
    source: 'import',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: 'flagged',
    possibleDuplicateOf: 'existing-1',
    searchTokens: [],
    nameLower: id.toLowerCase(),
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    importBatchId: 'batch-1',
    ...overrides,
  }
  return { id, data: () => data }
}

beforeEach(() => {
  vi.clearAllMocks()
  updateDocMock.mockResolvedValue(undefined)
  snapshotCallback = undefined
})

describe('useFlaggedDuplicates', () => {
  it('queries contacts filtered on duplicateReviewStatus == flagged, ordered newest first', () => {
    renderHook(() => useFlaggedDuplicates())

    expect(whereMock).toHaveBeenCalledWith('duplicateReviewStatus', '==', 'flagged')
    expect(orderByMock).toHaveBeenCalledWith('createdAt', 'desc')
    expect(collectionMock.mock.calls[0]![1]).toBe('contacts')
  })

  it('returns the flagged contacts from the snapshot', () => {
    const { result } = renderHook(() => useFlaggedDuplicates())

    act(() => {
      snapshotCallback?.({ docs: [contactDoc('c-1'), contactDoc('c-2')] })
    })

    expect(result.current.duplicates.map((c) => c.id)).toEqual(['c-1', 'c-2'])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a query error', () => {
    const { result } = renderHook(() => useFlaggedDuplicates())
    const onError = onSnapshotMock.mock.calls[0]![2] as (err: Error) => void

    act(() => {
      onError(new Error('permission-denied'))
    })

    expect(result.current.error).toBe('permission-denied')
    expect(result.current.loading).toBe(false)
  })
})

describe('markNotDuplicate', () => {
  it('clears duplicateReviewStatus and possibleDuplicateOf, without touching mergedInto', async () => {
    await markNotDuplicate('contact-1')

    expect(docMock).toHaveBeenCalledWith({}, 'contacts', 'contact-1')
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      duplicateReviewStatus: 'resolved',
      possibleDuplicateOf: null,
    })
    expect(payload).not.toHaveProperty('mergedInto')
  })
})

describe('confirmDuplicateMerge', () => {
  it('sets mergedInto on the losing contact and resolves the flag', async () => {
    await confirmDuplicateMerge('losing-1', 'winning-1')

    expect(docMock).toHaveBeenCalledWith({}, 'contacts', 'losing-1')
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      mergedInto: 'winning-1',
      duplicateReviewStatus: 'resolved',
    })
  })
})
