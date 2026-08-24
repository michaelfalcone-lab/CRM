/**
 * Unit test for `useOrganizationSearch`'s prefix query, with
 * `firebase/firestore` mocked out entirely (no emulator) — same approach as
 * `contacts.test.ts`/`organizations.test.ts`.
 *
 * This specifically guards against the "search existing org" bug where the
 * upper bound of the `nameLower` range query collapsed to an exact match
 * (`trimmed + ''` is a no-op) instead of a true prefix range
 * (`trimmed + '\uf8ff'`, using the private-use-area terminator character).
 * With the bug in place, searching "Acme" would never surface an org named
 * "Acme Sports Boosters" — only an org named exactly "acme" would match.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getDocsMock = vi.fn()
const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }))
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const orderByMock = vi.fn((...args: unknown[]) => ({ __orderBy: args }))
const limitMock = vi.fn((...args: unknown[]) => ({ __limit: args }))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  limit: (...args: unknown[]) => limitMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  query: vi.fn((ref: unknown) => ref),
  where: (...args: unknown[]) => whereMock(...args),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { useOrganizationSearch } from './organizationSearch'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useOrganizationSearch', () => {
  it('issues a true prefix range query, not an exact-match query', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'org-1',
          data: () => ({
            name: 'Acme Sports Boosters',
            nameLower: 'acme sports boosters',
          }),
        },
      ],
    })

    const { result } = renderHook(() => useOrganizationSearch('Acme'))

    await act(async () => {
      vi.advanceTimersByTime(200)
      // Flush the microtask queue so the getDocs() promise (and the
      // resulting setResults state update) settles before we assert —
      // fake timers don't fake promise microtasks, so a plain awaited
      // resolution is enough, no need for `waitFor`'s timer-based polling.
      await Promise.resolve()
      await Promise.resolve()
    })

    // The debounced query must resolve to a match even though the search
    // term ("acme") is only a prefix of the org's name ("acme sports
    // boosters"), not an exact match.
    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0]).toMatchObject({
      id: 'org-1',
      name: 'Acme Sports Boosters',
    })

    // Assert the actual where(...) call arguments to pin the fix: the upper
    // bound must be the lower bound plus the high-codepoint terminator, not
    // the lower bound unchanged.
    expect(whereMock).toHaveBeenCalledWith('nameLower', '>=', 'acme')
    expect(whereMock).toHaveBeenCalledWith('nameLower', '<=', 'acme')
    expect(whereMock).not.toHaveBeenCalledWith('nameLower', '<=', 'acme')
  })
})
