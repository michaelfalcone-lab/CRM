/**
 * Unit tests for `globalSearch.ts`:
 *   - `mergeGlobalSearchResults`, the pure merge/dedupe/label/exclude logic,
 *     tested directly — doesn't touch Firestore at all, but shares this
 *     file's mock setup with `useGlobalSearch`'s tests below since mocking
 *     `firebase/firestore` has no effect on a pure function (same approach
 *     as `contacts.test.ts`, which mixes pure-logic and Firestore-call
 *     assertions in one file).
 *   - `useGlobalSearch`'s query building, with `firebase/firestore` mocked
 *     out entirely (no emulator) — same approach as
 *     `organizationSearch.test.ts`, including that file's fix for the
 *     "prefix range collapsed to an exact match" bug: the upper bound must
 *     be the lower bound plus the private-use-area terminator character,
 *     asserted via `String.fromCharCode` rather than a literal/escaped
 *     string constant in this test file (a pasted terminator character has
 *     silently been dropped or substituted by tool pipelines before).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Organization } from 'shared'
import type { WithId } from '../firestoreTypes'

const getDocsMock = vi.fn()
const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }))
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const orderByMock = vi.fn((...args: unknown[]) => ({ __orderBy: args }))
const limitMock = vi.fn((...args: unknown[]) => ({ __limit: args }))
/** Unlike the other mocks here, `query()` actually threads its constraints
 * through onto the returned object (`__ref` + `__constraints`) rather than
 * just returning the collection ref unchanged — the Finding 1 regression
 * test below needs to see which constraints a given `getDocs` call's query
 * was built with, to faithfully reproduce real Firestore's
 * equality-filter-then-limit semantics instead of just asserting on the
 * `where`/`limit` mocks' call args in isolation. */
const queryMock = vi.fn((...args: unknown[]) => ({ __ref: args[0], __constraints: args.slice(1) }))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  limit: (...args: unknown[]) => limitMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  where: (...args: unknown[]) => whereMock(...args),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { mergeGlobalSearchResults, useGlobalSearch } from './globalSearch'

function contact(overrides: Partial<WithId<Contact>> = {}): WithId<Contact> {
  return {
    id: 'contact-1',
    firstName: 'Jamie',
    lastName: 'Rivers',
    organizationId: null,
    ownerId: 'rep-1',
    source: 'manual',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    duplicateReviewStatus: null,
    possibleDuplicateOf: null,
    searchTokens: [],
    nameLower: 'jamie rivers',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    importBatchId: null,
    ...overrides,
  }
}

function org(overrides: Partial<WithId<Organization>> = {}): WithId<Organization> {
  return {
    id: 'org-1',
    name: 'Acme Corp',
    type: '',
    phone: '',
    address: '',
    ownerId: 'rep-1',
    externalIds: { paciolanCustomerId: null },
    mergedInto: null,
    searchTokens: [],
    nameLower: 'acme corp',
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    createdBy: 'rep-1',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  getDocsMock.mockResolvedValue({ docs: [] })
})

interface FakeQuery {
  __ref: { __collection: string[] }
  __constraints: unknown[]
}

/** A minimal in-memory Firestore stand-in that actually applies a query's
 * `where`/`orderBy`/`limit` constraints (in that priority) to a fixture
 * dataset, the same way the real backend would: equality/range/
 * array-contains filters first, then ordering, then the result-count cap
 * last. This is what makes the Finding 1 regression test below meaningful
 * — with the plain per-call `getDocsMock.mockResolvedValueOnce(...)` used
 * elsewhere in this file, the mock can't distinguish "the query filtered
 * mergedInto before capping results" from "it didn't," since the resolved
 * value is hardcoded regardless of the query's actual constraints. */
function fakeFirestoreQuery<T extends { id: string }>(dataset: T[], q: FakeQuery) {
  let docs = [...dataset]
  let limitN = Infinity
  let orderField: string | null = null

  for (const constraint of q.__constraints) {
    if (!constraint || typeof constraint !== 'object') continue
    if ('__where' in constraint) {
      const [field, op, value] = (constraint as { __where: [string, string, unknown] }).__where
      docs = docs.filter((doc) => {
        const fieldValue = (doc as unknown as Record<string, unknown>)[field]
        switch (op) {
          case '==':
            return fieldValue === value
          case '>=':
            return typeof fieldValue === 'string' && typeof value === 'string' && fieldValue >= value
          case '<=':
            return typeof fieldValue === 'string' && typeof value === 'string' && fieldValue <= value
          case 'array-contains':
            return Array.isArray(fieldValue) && fieldValue.includes(value)
          default:
            return true
        }
      })
    } else if ('__orderBy' in constraint) {
      orderField = (constraint as { __orderBy: [string] }).__orderBy[0]
    } else if ('__limit' in constraint) {
      limitN = (constraint as { __limit: [number] }).__limit[0]
    }
  }

  if (orderField) {
    const field = orderField
    docs.sort((a, b) =>
      String((a as unknown as Record<string, unknown>)[field]).localeCompare(
        String((b as unknown as Record<string, unknown>)[field]),
      ),
    )
  }
  docs = docs.slice(0, limitN)
  return { docs: docs.map((doc) => ({ id: doc.id, data: () => doc })) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('mergeGlobalSearchResults', () => {
  it('labels a contact and an organization with the same name distinctly, and both appear', () => {
    const c = contact({ id: 'c-1', firstName: 'Riverside', lastName: 'Club' })
    const o = org({ id: 'o-1', name: 'Riverside Club' })

    const results = mergeGlobalSearchResults([c], [], [o], [])

    expect(results).toHaveLength(2)
    const contactResult = results.find((r) => r.type === 'contact')
    const orgResult = results.find((r) => r.type === 'organization')
    expect(contactResult).toMatchObject({
      id: 'c-1',
      type: 'contact',
      label: 'Riverside Club',
      path: '/contacts/c-1',
    })
    expect(orgResult).toMatchObject({
      id: 'o-1',
      type: 'organization',
      label: 'Riverside Club',
      path: '/organizations/o-1',
    })
  })

  it('excludes a contact with mergedInto set — a merged-away record must never surface in search', () => {
    const live = contact({ id: 'live', mergedInto: null })
    const merged = contact({ id: 'merged', mergedInto: 'live', firstName: 'Old', lastName: 'Duplicate' })

    const results = mergeGlobalSearchResults([live, merged], [], [], [])

    expect(results.map((r) => r.id)).toEqual(['live'])
  })

  it('excludes an organization with mergedInto set', () => {
    const live = org({ id: 'live', mergedInto: null })
    const merged = org({ id: 'merged', mergedInto: 'live', name: 'Old Org' })

    const results = mergeGlobalSearchResults([], [], [live, merged], [])

    expect(results.map((r) => r.id)).toEqual(['live'])
  })

  it('deduplicates a contact appearing in both the prefix and token result sets', () => {
    const c = contact({ id: 'dup' })
    const results = mergeGlobalSearchResults([c], [c], [], [])
    expect(results).toHaveLength(1)
  })

  it('deduplicates an organization appearing in both the prefix and token result sets', () => {
    const o = org({ id: 'dup' })
    const results = mergeGlobalSearchResults([], [], [o], [o])
    expect(results).toHaveLength(1)
  })

  it('returns an empty list when nothing matches', () => {
    expect(mergeGlobalSearchResults([], [], [], [])).toEqual([])
  })

  it("labels a contact result with its organization name as secondary text, falling back to email", () => {
    const withOrg = contact({ id: 'c-1', organizationName: 'Brown Athletics' })
    const withEmailOnly = contact({ id: 'c-2', email: 'jamie@example.com' })

    const results = mergeGlobalSearchResults([withOrg, withEmailOnly], [], [], [])

    expect(results.find((r) => r.id === 'c-1')?.secondary).toBe('Brown Athletics')
    expect(results.find((r) => r.id === 'c-2')?.secondary).toBe('jamie@example.com')
  })
})

describe('useGlobalSearch', () => {
  it('does not query at all for a blank term', () => {
    const { result } = renderHook(() => useGlobalSearch('   '))
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(getDocsMock).not.toHaveBeenCalled()
  })

  it('issues a true prefix range query (not an exact-match query) plus an array-contains token query, for both collections', async () => {
    renderHook(() => useGlobalSearch('Acme'))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    const prefixTerminator = String.fromCharCode(0xf8ff)
    expect(whereMock).toHaveBeenCalledWith('nameLower', '>=', 'acme')
    expect(whereMock).toHaveBeenCalledWith('nameLower', '<=', 'acme' + prefixTerminator)
    expect(whereMock).not.toHaveBeenCalledWith('nameLower', '<=', 'acme')
    expect(whereMock).toHaveBeenCalledWith('searchTokens', 'array-contains', 'acme')

    const queriedCollections = collectionMock.mock.calls.map((call) => call[1])
    expect(queriedCollections).toContain('contacts')
    expect(queriedCollections).toContain('organizations')

    // 2 queries (prefix + token) per collection = 4 total getDocs calls.
    expect(getDocsMock).toHaveBeenCalledTimes(4)
  })

  it('merges results from all four queries into one labeled list', async () => {
    const c = contact({ id: 'c-1', firstName: 'Alice', lastName: 'Acme' })
    const o = org({ id: 'o-1', name: 'Acme Corp' })

    getDocsMock
      .mockResolvedValueOnce({ docs: [{ id: c.id, data: () => c }] }) // contacts prefix
      .mockResolvedValueOnce({ docs: [] }) // contacts token
      .mockResolvedValueOnce({ docs: [{ id: o.id, data: () => o }] }) // orgs prefix
      .mockResolvedValueOnce({ docs: [] }) // orgs token

    const { result } = renderHook(() => useGlobalSearch('acme'))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.results).toHaveLength(2)
    expect(result.current.results.map((r) => r.type).sort()).toEqual(['contact', 'organization'])
    expect(result.current.loading).toBe(false)
  })

  it('excludes a merged contact returned by a raw query from the final results', async () => {
    const merged = contact({ id: 'merged', mergedInto: 'someone-else' })

    getDocsMock
      .mockResolvedValueOnce({ docs: [{ id: merged.id, data: () => merged }] }) // contacts prefix
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })

    const { result } = renderHook(() => useGlobalSearch('jamie'))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.results).toEqual([])
  })

  it('does not hide a live contact behind the per-query result cap when merged records sort ahead of it (Finding 1 regression)', async () => {
    // 8 merged contacts, alphabetically ahead of 2 live ones, all within the
    // "acme" prefix range — exactly enough merged records to fill
    // MAX_RESULTS_PER_QUERY (8) before a naive raw-query limit ever reaches
    // the live ones. If the `mergedInto` exclusion were only applied after
    // fetching (the pre-fix behavior), the live contacts would never even
    // be part of the fetched set and would vanish from search entirely.
    const mergedDocs = Array.from({ length: 8 }, (_, i) =>
      contact({ id: `merged-${i}`, nameLower: `acme ${i}`, mergedInto: 'winner' }),
    )
    const liveDocs = [
      contact({ id: 'live-1', nameLower: 'acme z1', mergedInto: null }),
      contact({ id: 'live-2', nameLower: 'acme z2', mergedInto: null }),
    ]
    const contactsDataset = [...mergedDocs, ...liveDocs]

    getDocsMock.mockImplementation((q: unknown) => {
      const query = q as FakeQuery
      if (query.__ref.__collection[0] === 'contacts') {
        return Promise.resolve(fakeFirestoreQuery(contactsDataset, query))
      }
      return Promise.resolve({ docs: [] })
    })

    const { result } = renderHook(() => useGlobalSearch('acme'))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    const ids = result.current.results.map((r) => r.id)
    expect(ids).toContain('live-1')
    expect(ids).toContain('live-2')
  })

  it('debounces: does not query again for a rapid follow-up keystroke before the debounce window elapses', async () => {
    const { rerender } = renderHook(({ term }) => useGlobalSearch(term), {
      initialProps: { term: 'a' },
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ term: 'ac' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(getDocsMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getDocsMock).toHaveBeenCalledTimes(4)
  })
})
