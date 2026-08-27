/**
 * Pins the Task 8b fix-round-1 finding: `useDashboardData`'s 'overall'
 * scope (`range === null`) must still apply a has-the-field `>=` epoch
 * filter on the two OPTIONAL opportunity fields (`wonAt`/`lostAt`), never
 * an unfiltered read — an unfiltered read returns every still-open
 * opportunity as both "won" and "lost", which is exactly the bug this
 * task's own manual emulator walk caught (seeded 2 won / 1 lost out of 6
 * total rendered as "6 Won, 6 Lost"; see `useDashboardData.ts`'s header
 * comment). Before this test existed, deleting the fix entirely (the
 * `fieldAlwaysPresent` branch at `useDashboardData.ts:94-98`) still left
 * every other test in the suite green — this file exists so that
 * regression is caught here instead of by eye again.
 *
 * `firebase/firestore` is mocked per the pattern established in
 * `frontend/src/lib/firestore/users.test.ts` and `contacts.test.ts`
 * (`Timestamp.fromDate` mocked to a deterministic, comparable shape).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }))
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const onSnapshotMock = vi.fn((_query: unknown, _onNext: unknown, _onError: unknown) => vi.fn())
const fromDateMock = vi.fn((d: Date) => ({ __ts: d.getTime() }))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...args),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ __query: [ref, ...constraints] })),
  where: (...args: unknown[]) => whereMock(...args),
  Timestamp: {
    fromDate: (...args: [Date]) => fromDateMock(...args),
  },
}))

vi.mock('../../lib/firebase', () => ({ db: {} }))

import { useDashboardData } from './useDashboardData'

function whereFields(): string[] {
  return whereMock.mock.calls.map((call) => call[0] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDashboardData — overall scope (range === null)', () => {
  it('still applies a has-the-field >= epoch filter on wonAt and lostAt', () => {
    renderHook(() => useDashboardData(null))

    // Every FirestoreTimestamp passed to `where` for wonAt/lostAt must be
    // built from the epoch, not omitted — an inequality filter is what
    // keeps Firestore's "document must have the field" exclusion in
    // effect for these two OPTIONAL fields.
    const epochTs = { __ts: new Date(0).getTime() }
    expect(whereMock).toHaveBeenCalledWith('wonAt', '>=', epochTs)
    expect(whereMock).toHaveBeenCalledWith('lostAt', '>=', epochTs)
  })

  it('never filters on occurredAt or createdAt at all (always-present fields go fully unfiltered)', () => {
    renderHook(() => useDashboardData(null))

    expect(whereFields()).not.toContain('occurredAt')
    expect(whereFields()).not.toContain('createdAt')
  })

  it('applies exactly one where() per optional field (no upper bound for "overall")', () => {
    renderHook(() => useDashboardData(null))

    const wonCalls = whereMock.mock.calls.filter((call) => call[0] === 'wonAt')
    const lostCalls = whereMock.mock.calls.filter((call) => call[0] === 'lostAt')
    expect(wonCalls).toHaveLength(1)
    expect(lostCalls).toHaveLength(1)
  })
})

describe('useDashboardData — a real period range', () => {
  it('applies matching >=/<= pairs to occurredAt, createdAt, wonAt, and lostAt', () => {
    const start = new Date(2026, 7, 1)
    const end = new Date(2026, 7, 31, 23, 59, 59, 999)

    renderHook(() => useDashboardData({ start, end }))

    const startTs = { __ts: start.getTime() }
    const endTs = { __ts: end.getTime() }

    for (const field of ['occurredAt', 'createdAt', 'wonAt', 'lostAt']) {
      expect(whereMock).toHaveBeenCalledWith(field, '>=', startTs)
      expect(whereMock).toHaveBeenCalledWith(field, '<=', endTs)
    }

    // Exactly two constraints (the >= and <= pair) per field — no leftover
    // "overall" epoch filter sneaking in alongside a real range.
    for (const field of ['occurredAt', 'createdAt', 'wonAt', 'lostAt']) {
      const calls = whereMock.mock.calls.filter((call) => call[0] === field)
      expect(calls).toHaveLength(2)
    }
  })
})
