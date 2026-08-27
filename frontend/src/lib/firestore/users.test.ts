/**
 * Pins the Task 8b fix: `useOwnerDirectory` must fetch the full
 * active-user directory for ANY active current user, not just an admin.
 * Before this fix, a rep's session got back only their own entry
 * (`isComplete: false`), so any UI resolving another rep's `ownerId` (the
 * sales-output dashboard's per-rep rows, most notably) rendered a real
 * name for one rep and a placeholder for the other — but only when
 * viewed by a rep, never in an admin-only spot check. See this file's
 * header comment for the full explanation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { User } from 'shared'

const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }))
const orderByMock = vi.fn((...args: unknown[]) => ({ __orderBy: args }))
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
let snapshotCallback: ((snapshot: { docs: { data: () => unknown }[] }) => void) | undefined
const onSnapshotMock = vi.fn((_query: unknown, onNext: typeof snapshotCallback) => {
  snapshotCallback = onNext
  return vi.fn() // unsubscribe
})

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...args),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...(args as [unknown, typeof snapshotCallback])),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  query: vi.fn((ref: unknown) => ref),
  where: (...args: unknown[]) => whereMock(...args),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { useOwnerDirectory } from './users'

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    email: 'rep@brown.edu',
    displayName: 'Rep One',
    photoURL: '',
    position: '',
    role: 'rep',
    active: true,
    authUid: 'rep-1-uid',
    createdAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'admin@brown.edu',
    ...overrides,
  }
}

function emitUsers(users: User[]) {
  snapshotCallback?.({ docs: users.map((u) => ({ data: () => u })) })
}

beforeEach(() => {
  vi.clearAllMocks()
  snapshotCallback = undefined
})

describe('useOwnerDirectory', () => {
  it('fetches the full active-user directory for a REP (not just their own entry)', async () => {
    const rep = fakeUser({ role: 'rep', authUid: 'rep-1-uid', displayName: 'Rep One' })
    const { result } = renderHook(() => useOwnerDirectory(rep))

    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
    // The query must filter on active === true, same as the admin path
    // used to — this is the collection-wide query, not a self-only one.
    expect(whereMock).toHaveBeenCalledWith('active', '==', true)

    emitUsers([
      fakeUser({ authUid: 'rep-1-uid', displayName: 'Rep One' }),
      fakeUser({ authUid: 'rep-2-uid', displayName: 'Rep Two', email: 'rep2@brown.edu' }),
    ])

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.owners).toEqual([
      { authUid: 'rep-1-uid', displayName: 'Rep One', role: 'rep' },
      { authUid: 'rep-2-uid', displayName: 'Rep Two', role: 'rep' },
    ])
    expect(result.current.isComplete).toBe(true)
  })

  it('fetches the identical full directory for an ADMIN — same query, same shape', async () => {
    const admin = fakeUser({ role: 'admin', authUid: 'admin-1-uid', displayName: 'Admin One' })
    const { result } = renderHook(() => useOwnerDirectory(admin))

    emitUsers([
      fakeUser({ authUid: 'admin-1-uid', displayName: 'Admin One', role: 'admin' }),
      fakeUser({ authUid: 'rep-1-uid', displayName: 'Rep One' }),
    ])

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.owners).toHaveLength(2)
    expect(result.current.isComplete).toBe(true)
  })

  it('returns an empty, complete-vacuously-false directory with no active current user', () => {
    const { result } = renderHook(() => useOwnerDirectory(null))
    expect(onSnapshotMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ owners: [], isComplete: false, loading: false })
  })

  it('filters out any directory entry missing authUid (not yet linked)', async () => {
    const rep = fakeUser()
    const { result } = renderHook(() => useOwnerDirectory(rep))
    emitUsers([
      fakeUser({ authUid: 'rep-1-uid', displayName: 'Rep One' }),
      fakeUser({ authUid: null, displayName: 'Invited, Not Yet Linked', email: 'invited@brown.edu' }),
    ])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.owners).toEqual([
      { authUid: 'rep-1-uid', displayName: 'Rep One', role: 'rep' },
    ])
  })
})
