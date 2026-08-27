/**
 * Component test for `DuplicatesPage` — mocks `useCurrentUser`,
 * `useFlaggedDuplicates`/`useOwnerDirectory`, and `DuplicateRow` itself, so
 * this only tests the page's own loading/error/empty/list wiring, not
 * `DuplicateRow`'s internals (covered by `DuplicateRow.test.tsx`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CurrentUserContextValue } from '../../app/AuthProvider'
import { DuplicatesPage } from './DuplicatesPage'

const useCurrentUserMock = vi.fn<() => Partial<CurrentUserContextValue>>()
const useFlaggedDuplicatesMock = vi.fn()
const useOwnerDirectoryMock = vi.fn()

vi.mock('../../app/AuthProvider', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}))

vi.mock('../../lib', () => ({
  useFlaggedDuplicates: () => useFlaggedDuplicatesMock(),
  useOwnerDirectory: () => useOwnerDirectoryMock(),
}))

vi.mock('./DuplicateRow', () => ({
  DuplicateRow: ({ contact, isAdmin }: { contact: { id: string }; isAdmin: boolean }) => (
    <div data-testid={`row-${contact.id}`}>{isAdmin ? 'admin-row' : 'rep-row'}</div>
  ),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <DuplicatesPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCurrentUserMock.mockReturnValue({
    user: { role: 'admin', authUid: 'admin-1' } as never,
  })
  useOwnerDirectoryMock.mockReturnValue({ owners: [], isComplete: true, loading: false })
})

describe('DuplicatesPage', () => {
  it('shows a loading state', () => {
    useFlaggedDuplicatesMock.mockReturnValue({ duplicates: [], loading: true, error: null })
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an error state', () => {
    useFlaggedDuplicatesMock.mockReturnValue({ duplicates: [], loading: false, error: 'permission-denied' })
    renderPage()
    expect(screen.getByText('permission-denied')).toBeInTheDocument()
  })

  it('shows an explicit empty state when there are no flagged duplicates', () => {
    useFlaggedDuplicatesMock.mockReturnValue({ duplicates: [], loading: false, error: null })
    renderPage()
    expect(screen.getByText(/no flagged duplicates/i)).toBeInTheDocument()
  })

  it('renders one row per flagged duplicate, passing isAdmin through', () => {
    useFlaggedDuplicatesMock.mockReturnValue({
      duplicates: [{ id: 'c-1' }, { id: 'c-2' }],
      loading: false,
      error: null,
    })
    renderPage()

    expect(screen.getByTestId('row-c-1')).toHaveTextContent('admin-row')
    expect(screen.getByTestId('row-c-2')).toHaveTextContent('admin-row')
  })

  it('passes isAdmin=false through for a rep', () => {
    useCurrentUserMock.mockReturnValue({ user: { role: 'rep', authUid: 'rep-1' } as never })
    useFlaggedDuplicatesMock.mockReturnValue({
      duplicates: [{ id: 'c-1' }],
      loading: false,
      error: null,
    })
    renderPage()

    expect(screen.getByTestId('row-c-1')).toHaveTextContent('rep-row')
  })
})
